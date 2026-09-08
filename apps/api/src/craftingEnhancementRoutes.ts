import type { Hono } from 'hono';
import type postgres from 'postgres';

type Sql=ReturnType<typeof postgres>;
type RequirePlayerId=(authorization?:string)=>Promise<string>;
const n=(v:unknown)=>Number(v??0);

async function receipt(tx:any,playerId:string,operation:string,key?:string){
  if(!key||key.length>120)throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const rows=await tx`insert into game.action_receipts(player_id,operation,idempotency_key) values(${playerId},${operation},${key}) on conflict(player_id,operation,idempotency_key) do nothing returning id`;
  if(rows[0])return{id:rows[0].id,duplicate:false,response:null};
  const [old]=await tx`select response from game.action_receipts where player_id=${playerId} and operation=${operation} and idempotency_key=${key}`;
  return{id:null,duplicate:true,response:old?.response??{}};
}

async function talentBonuses(tx:any,characterId:string,professionId:string){
  const [row]=await tx`
    select
      coalesce(sum(case when d.effect ? 'craft_speed' then (d.effect->>'craft_speed')::numeric*t.rank else 0 end),0)::numeric speed,
      coalesce(sum(case when d.effect ? 'gold_discount' then (d.effect->>'gold_discount')::numeric*t.rank else 0 end),0)::numeric discount,
      coalesce(sum(case when d.effect ? 'yield_bonus' then (d.effect->>'yield_bonus')::numeric*t.rank else 0 end),0)::numeric yield_bonus
    from game.character_profession_talents t
    join game.profession_talent_definitions d on d.id=t.talent_id
    where t.character_id=${characterId} and d.profession_id=${professionId}
  `;
  return{speed:Math.min(.6,n(row?.speed)),discount:Math.min(.6,n(row?.discount)),yieldBonus:Math.min(.75,n(row?.yield_bonus))};
}

export function registerCraftingEnhancementRoutes(app:Hono,sql:Sql,requirePlayerId:RequirePlayerId){
  app.post('/v1/crafting/:recipeId/start-enhanced',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const recipeId=c.req.param('recipeId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'craft.start.enhanced',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};
      const [ch]=await tx`select id from game.characters where player_id=${playerId} for update`;const [recipe]=await tx`select * from game.crafting_recipes where id=${recipeId} and enabled`;
      if(!ch||!recipe)throw new Error('RECIPE_NOT_FOUND');
      await tx`insert into game.profession_progress(character_id,profession_id) values(${ch.id},${recipe.profession_id}) on conflict do nothing`;
      const [progress]=await tx`select level from game.profession_progress where character_id=${ch.id} and profession_id=${recipe.profession_id} for update`;
      if(n(progress?.level)<n(recipe.min_profession_level))throw new Error('PROFESSION_LEVEL_REQUIRED');
      const bonuses=await talentBonuses(tx,String(ch.id),String(recipe.profession_id));
      const goldCost=Math.max(0,Math.ceil(n(recipe.gold_cost)*(1-bonuses.discount)));
      const seconds=Math.max(5,Math.ceil(n(recipe.duration_seconds)*(1-bonuses.speed)));
      const [gold]=await tx`select amount from game.resources where character_id=${ch.id} and resource_code='gold' for update`;
      if(n(gold?.amount)<goldCost)throw new Error('INSUFFICIENT_GOLD');
      const ingredients=Array.isArray(recipe.ingredients)?recipe.ingredients:[];
      for(const ing of ingredients){const [res]=await tx`select amount from game.resources where character_id=${ch.id} and resource_code=${String(ing.resource)} for update`;if(n(res?.amount)<n(ing.quantity))throw new Error('INSUFFICIENT_MATERIALS');}
      await tx`update game.resources set amount=amount-${goldCost},updated_at=now() where character_id=${ch.id} and resource_code='gold'`;
      for(const ing of ingredients)await tx`update game.resources set amount=amount-${n(ing.quantity)},updated_at=now() where character_id=${ch.id} and resource_code=${String(ing.resource)}`;
      const [job]=await tx`insert into game.crafting_jobs(character_id,recipe_id,finishes_at) values(${ch.id},${recipeId},now()+(${seconds}||' seconds')::interval) returning id,finishes_at`;
      const response={jobId:String(job.id),finishesAt:job.finishes_at,goldCost,durationSeconds:seconds,bonuses};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},409);return c.json(out,201);
  });

  app.post('/v1/crafting/jobs/:jobId/claim-enhanced',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const jobId=c.req.param('jobId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'craft.claim.enhanced',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};
      const [job]=await tx`select j.*,r.outputs,r.profession_id from game.crafting_jobs j join game.characters ch on ch.id=j.character_id join game.crafting_recipes r on r.id=j.recipe_id where j.id=${jobId} and ch.player_id=${playerId} for update`;
      if(!job)throw new Error('JOB_NOT_FOUND');if(job.claimed_at)throw new Error('ALREADY_CLAIMED');if(new Date(job.finishes_at).getTime()>Date.now())throw new Error('NOT_READY');
      const bonuses=await talentBonuses(tx,String(job.character_id),String(job.profession_id));
      const extra=Math.random()<bonuses.yieldBonus;
      const outputs=Array.isArray(job.outputs)?job.outputs:[];const granted:any[]=[];
      for(const output of outputs){
        const itemId=String(output.item);const quantity=Math.max(1,n(output.quantity))+(extra?1:0);const [def]=await tx`select id from game.item_definitions where id=${itemId} and enabled`;
        if(def){await tx`insert into game.inventory_items(character_id,item_definition_id,quantity) values(${job.character_id},${itemId},${quantity})`;granted.push({item:itemId,quantity});}
        else{await tx`insert into game.resources(character_id,resource_code,amount) values(${job.character_id},${`crafted_${itemId}`},${quantity}) on conflict(character_id,resource_code) do update set amount=game.resources.amount+excluded.amount,updated_at=now()`;granted.push({resource:`crafted_${itemId}`,quantity});}
      }
      await tx`update game.crafting_jobs set claimed_at=now(),status='claimed' where id=${job.id}`;
      const response={claimed:true,outputs:granted,bonusOutput:extra,professionXp:25*Math.max(1,n(job.quantity))};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });
}
