import type { Hono } from 'hono';
import type postgres from 'postgres';
import { resolveDamage, chooseEnemyAction, applyEnemyAbility, tickCooldowns } from './combatEngine.js';

type Sql = ReturnType<typeof postgres>;
type RequirePlayerId = (authorization?: string) => Promise<string>;
type BuildSnapshot = (playerId: string) => Promise<unknown>;

const rolls = () => ({ hit: Math.random(), crit: Math.random(), block: Math.random(), variance: Math.random() });
const n = (value: unknown) => Number(value ?? 0);

function playerStats(row: any) {
  return {
    physicalAttack: n(row.physical_attack), magicAttack: n(row.magic_attack), defense: n(row.defense),
    magicResistance: n(row.magic_resistance), critChance: n(row.crit_chance), critDamage: n(row.crit_damage),
    accuracy: n(row.accuracy), evasion: n(row.evasion), blockChance: n(row.block_chance),
  };
}

function enemyStats(row: any) {
  return {
    physicalAttack: n(row.attack), magicAttack: n(row.attack), defense: n(row.defense),
    magicResistance: n(row.magic_resistance), critChance: 0.05, critDamage: 1.5,
    accuracy: 1, evasion: 0.02, blockChance: 0.03,
  };
}

async function auth(c: any, requirePlayerId: RequirePlayerId) {
  return requirePlayerId(c.req.header('authorization'));
}

async function receipt(tx: any, playerId: string, operation: string, key?: string) {
  if (!key || key.length > 120) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const inserted = await tx`
    insert into game.action_receipts(player_id,operation,idempotency_key)
    values(${playerId},${operation},${key})
    on conflict(player_id,operation,idempotency_key) do nothing returning id,response
  `;
  if (inserted[0]) return { id: inserted[0].id, duplicate: false, response: null };
  const [old] = await tx`select response from game.action_receipts where player_id=${playerId} and operation=${operation} and idempotency_key=${key}`;
  return { id: null, duplicate: true, response: old?.response ?? {} };
}

export function registerGameplayRoutes(app: Hono, sql: Sql, requirePlayerId: RequirePlayerId, buildSnapshot: BuildSnapshot) {
  app.get('/v1/content/overview', async (c) => {
    const [counts] = await sql`
      select
        (select count(*) from game.enemy_definitions where enabled) enemies,
        (select count(*) from game.boss_definitions where enabled) bosses,
        (select count(*) from game.quest_definitions where enabled) quests,
        (select count(*) from game.crafting_recipes where enabled) recipes,
        (select count(*) from game.achievement_definitions where enabled) achievements,
        (select count(*) from game.realms where enabled) realms,
        (select count(*) from game.event_definitions where enabled) events
    `;
    return c.json(counts);
  });

  app.get('/v1/inventory', async (c) => {
    let playerId: string; try { playerId = await auth(c, requirePlayerId); } catch { return c.json({error:'UNAUTHORIZED'},401); }
    const items = await sql`
      select i.id,i.quantity,i.enhancement_level,i.sockets,i.bound,i.acquired_at,
             d.id definition_id,d.name_es,d.name_en,d.item_type,d.rarity,d.min_level,d.stats,d.set_id,
             e.slot equipped_slot
      from game.inventory_items i
      join game.characters ch on ch.id=i.character_id
      join game.item_definitions d on d.id=i.item_definition_id
      left join game.equipment e on e.inventory_item_id=i.id
      where ch.player_id=${playerId}
      order by i.acquired_at desc
    `;
    return c.json({items});
  });

  app.post('/v1/inventory/:itemId/equip', async (c) => {
    let playerId: string; try { playerId = await auth(c, requirePlayerId); } catch { return c.json({error:'UNAUTHORIZED'},401); }
    const key=c.req.header('idempotency-key'); const itemId=c.req.param('itemId');
    const body=await c.req.json().catch(()=>({})); const slot=String(body.slot??'').slice(0,40);
    if(!slot) return c.json({error:'SLOT_REQUIRED'},400);
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'inventory.equip',key); if(r.duplicate) return {duplicate:true,response:r.response};
      const [item]=await tx`select i.id,i.character_id,d.item_type from game.inventory_items i join game.characters ch on ch.id=i.character_id join game.item_definitions d on d.id=i.item_definition_id where i.id=${itemId} and ch.player_id=${playerId} for update`;
      if(!item) throw new Error('ITEM_NOT_FOUND');
      await tx`delete from game.equipment where character_id=${item.character_id} and slot=${slot}`;
      await tx`insert into game.equipment(character_id,slot,inventory_item_id) values(${item.character_id},${slot},${item.id})`;
      const response={equipped:true,itemId,slot}; await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return {duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error' in out) return c.json({error:out.error},404); return c.json(out);
  });

  app.get('/v1/quests', async (c) => {
    let playerId: string; try { playerId = await auth(c, requirePlayerId); } catch { return c.json({error:'UNAUTHORIZED'},401); }
    const rows=await sql`
      select q.*,coalesce(p.status,'available') status,coalesce(p.progress,'{}'::jsonb) progress
      from game.quest_definitions q
      join game.characters ch on ch.player_id=${playerId}
      left join game.quest_progress p on p.character_id=ch.id and p.quest_id=q.id
      where q.enabled and q.min_level<=ch.level
      order by case q.category when 'story' then 0 when 'daily' then 1 else 2 end,q.min_level,q.id
      limit 100
    `;
    return c.json({quests:rows});
  });

  app.post('/v1/quests/:questId/accept', async (c) => {
    let playerId:string; try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const questId=c.req.param('questId'); const key=c.req.header('idempotency-key');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'quest.accept',key); if(r.duplicate)return{duplicate:true};
      const [ch]=await tx`select id,level from game.characters where player_id=${playerId}`;
      const [q]=await tx`select id,min_level from game.quest_definitions where id=${questId} and enabled`;
      if(!ch||!q) throw new Error('QUEST_NOT_FOUND'); if(n(ch.level)<n(q.min_level)) throw new Error('QUEST_LOCKED');
      await tx`insert into game.quest_progress(character_id,quest_id,status,progress) values(${ch.id},${questId},'active','{}') on conflict(character_id,quest_id) do update set status=case when game.quest_progress.status='claimed' then game.quest_progress.status else 'active' end,updated_at=now()`;
      await tx`update game.action_receipts set response='{"accepted":true}'::jsonb where id=${r.id}`; return{duplicate:false};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},out.error==='QUEST_LOCKED'?403:404); return c.json(out);
  });

  app.get('/v1/crafting/recipes', async (c) => {
    const rows=await sql`select * from game.crafting_recipes where enabled order by min_profession_level,id`;
    return c.json({recipes:rows});
  });

  app.post('/v1/crafting/:recipeId/start', async (c) => {
    let playerId:string; try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const recipeId=c.req.param('recipeId'); const key=c.req.header('idempotency-key');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'craft.start',key); if(r.duplicate)return{duplicate:true,response:r.response};
      const [ch]=await tx`select id from game.characters where player_id=${playerId} for update`;
      const [recipe]=await tx`select * from game.crafting_recipes where id=${recipeId} and enabled`;
      if(!ch||!recipe) throw new Error('RECIPE_NOT_FOUND');
      const [gold]=await tx`select amount from game.resources where character_id=${ch.id} and resource_code='gold' for update`;
      if(n(gold?.amount)<n(recipe.gold_cost)) throw new Error('INSUFFICIENT_GOLD');
      const ingredients=Array.isArray(recipe.ingredients)?recipe.ingredients:[];
      for(const ing of ingredients){
        const [res]=await tx`select amount from game.resources where character_id=${ch.id} and resource_code=${String(ing.resource)} for update`;
        if(n(res?.amount)<n(ing.quantity)) throw new Error('INSUFFICIENT_MATERIALS');
      }
      await tx`update game.resources set amount=amount-${n(recipe.gold_cost)},updated_at=now() where character_id=${ch.id} and resource_code='gold'`;
      for(const ing of ingredients) await tx`update game.resources set amount=amount-${n(ing.quantity)},updated_at=now() where character_id=${ch.id} and resource_code=${String(ing.resource)}`;
      const [job]=await tx`insert into game.crafting_jobs(character_id,recipe_id,finishes_at) values(${ch.id},${recipeId},now()+(${n(recipe.duration_seconds)}||' seconds')::interval) returning id,finishes_at`;
      const response={jobId:String(job.id),finishesAt:job.finishes_at}; await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},out.error.startsWith('INSUFFICIENT')?409:404); return c.json(out,201);
  });

  app.post('/v1/crafting/jobs/:jobId/claim', async (c) => {
    let playerId:string; try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const jobId=c.req.param('jobId'); const key=c.req.header('idempotency-key');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'craft.claim',key); if(r.duplicate)return{duplicate:true,response:r.response};
      const [job]=await tx`select j.*,r.outputs from game.crafting_jobs j join game.characters ch on ch.id=j.character_id join game.crafting_recipes r on r.id=j.recipe_id where j.id=${jobId} and ch.player_id=${playerId} for update`;
      if(!job)throw new Error('JOB_NOT_FOUND'); if(job.claimed_at)throw new Error('ALREADY_CLAIMED'); if(new Date(job.finishes_at).getTime()>Date.now())throw new Error('NOT_READY');
      const outputs=Array.isArray(job.outputs)?job.outputs:[];
      for(const outp of outputs){
        const itemId=String(outp.item); const [def]=await tx`select id from game.item_definitions where id=${itemId}`;
        if(def) await tx`insert into game.inventory_items(character_id,item_definition_id,quantity) values(${job.character_id},${itemId},${Math.max(1,n(outp.quantity))})`;
      }
      await tx`update game.crafting_jobs set claimed_at=now(),status='claimed' where id=${job.id}`;
      const response={claimed:true,outputs}; await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`; return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},out.error==='NOT_READY'?409:404); return c.json(out);
  });

  app.get('/v1/bastion', async (c) => {
    let playerId:string; try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const rows=await sql`
      select b.*,d.name_es,d.name_en,d.max_level,d.base_upgrade_seconds,d.base_gold_cost,d.production_resource,d.base_production_per_hour,d.base_capacity,d.benefits
      from game.bastion_buildings b join game.characters ch on ch.id=b.character_id
      left join game.bastion_building_definitions d on d.code=b.building_code
      where ch.player_id=${playerId} order by b.building_code
    `;
    return c.json({serverTime:new Date().toISOString(),buildings:rows});
  });

  app.post('/v1/bastion/:code/upgrade', async (c) => {
    let playerId:string; try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const code=c.req.param('code'); const key=c.req.header('idempotency-key');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'bastion.upgrade',key); if(r.duplicate)return{duplicate:true,response:r.response};
      const [b]=await tx`select b.*,d.max_level,d.base_upgrade_seconds,d.base_gold_cost from game.bastion_buildings b join game.characters ch on ch.id=b.character_id join game.bastion_building_definitions d on d.code=b.building_code where ch.player_id=${playerId} and b.building_code=${code} for update`;
      if(!b)throw new Error('BUILDING_NOT_FOUND'); if(b.upgrade_finishes_at&&new Date(b.upgrade_finishes_at).getTime()>Date.now())throw new Error('UPGRADE_RUNNING'); if(n(b.level)>=n(b.max_level))throw new Error('MAX_LEVEL');
      const cost=Math.round(n(b.base_gold_cost)*Math.pow(1.32,n(b.level)-1)); const seconds=Math.round(n(b.base_upgrade_seconds)*Math.pow(1.18,n(b.level)-1));
      const [gold]=await tx`select amount from game.resources where character_id=${b.character_id} and resource_code='gold' for update`; if(n(gold?.amount)<cost)throw new Error('INSUFFICIENT_GOLD');
      await tx`update game.resources set amount=amount-${cost},updated_at=now() where character_id=${b.character_id} and resource_code='gold'`;
      const [updated]=await tx`update game.bastion_buildings set upgrade_started_at=now(),upgrade_finishes_at=now()+(${seconds}||' seconds')::interval,updated_at=now() where character_id=${b.character_id} and building_code=${code} returning upgrade_finishes_at`;
      const response={code,cost,finishesAt:updated.upgrade_finishes_at};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.post('/v1/bastion/:code/complete', async (c) => {
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const code=c.req.param('code');const key=c.req.header('idempotency-key');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'bastion.complete',key);if(r.duplicate)return{duplicate:true,response:r.response};
      const [b]=await tx`select b.* from game.bastion_buildings b join game.characters ch on ch.id=b.character_id where ch.player_id=${playerId} and b.building_code=${code} for update`;
      if(!b||!b.upgrade_finishes_at)throw new Error('NO_UPGRADE');if(new Date(b.upgrade_finishes_at).getTime()>Date.now())throw new Error('NOT_READY');
      const [updated]=await tx`update game.bastion_buildings set level=level+1,upgrade_started_at=null,upgrade_finishes_at=null,updated_at=now() where character_id=${b.character_id} and building_code=${code} returning level`;
      const response={code,level:updated.level};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.get('/v1/battle-pass',async c=>{
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const [season]=await sql`select * from game.battle_pass_seasons where now() between starts_at and ends_at order by starts_at desc limit 1`;
    if(!season)return c.json({season:null,rewards:[]});
    await sql`insert into game.battle_pass_progress(season_id,player_id) values(${season.id},${playerId}) on conflict do nothing`;
    const [progress]=await sql`select * from game.battle_pass_progress where season_id=${season.id} and player_id=${playerId}`;
    const rewards=await sql`select r.*,exists(select 1 from game.battle_pass_claims c where c.season_id=r.season_id and c.level=r.level and c.track=r.track and c.player_id=${playerId}) claimed from game.battle_pass_rewards r where r.season_id=${season.id} order by r.level,r.track`;
    return c.json({season,progress,rewards});
  });

  app.post('/v1/daily-rewards/claim',async c=>{
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const key=c.req.header('idempotency-key');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'daily.claim',key);if(r.duplicate)return{duplicate:true,response:r.response};
      await tx`insert into game.daily_reward_state(player_id) values(${playerId}) on conflict do nothing`;
      const [state]=await tx`select * from game.daily_reward_state where player_id=${playerId} for update`;
      if(state.last_claimed_at && new Date(state.last_claimed_at).toDateString()===new Date().toDateString())throw new Error('ALREADY_CLAIMED_TODAY');
      const [reward]=await tx`select * from game.daily_reward_definitions where cycle_day=${state.cycle_day}`;
      const [ch]=await tx`select id from game.characters where player_id=${playerId}`;if(!ch)throw new Error('CHARACTER_REQUIRED');
      const rewardJson=reward?.reward??{};if(n(rewardJson.gold)>0)await tx`insert into game.resources(character_id,resource_code,amount) values(${ch.id},'gold',${n(rewardJson.gold)}) on conflict(character_id,resource_code) do update set amount=game.resources.amount+excluded.amount,updated_at=now()`;
      const nextDay=n(state.cycle_day)>=30?1:n(state.cycle_day)+1;await tx`update game.daily_reward_state set streak=streak+1,cycle_day=${nextDay},last_claimed_at=now(),updated_at=now() where player_id=${playerId}`;
      const response={claimed:true,day:state.cycle_day,reward:rewardJson};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.get('/v1/events',async c=>{
    const rows=await sql`select d.*,i.id instance_id,i.starts_at,i.ends_at,i.state,i.status from game.event_definitions d left join game.event_instances i on i.event_id=d.id and now() between i.starts_at and i.ends_at where d.enabled order by d.id`;
    return c.json({events:rows});
  });

  app.get('/v1/rankings/:type',async c=>{
    const type=c.req.param('type');const rows=await sql`select r.*,p.display_name,c.name character_name from game.ranking_snapshots r left join game.players p on p.id=r.player_id left join game.characters c on c.player_id=p.id where r.ranking_type=${type} order by r.rank limit 100`;
    return c.json({ranking:type,entries:rows});
  });

  app.post('/v1/combat/start',async c=>{
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const key=c.req.header('idempotency-key');const body=await c.req.json().catch(()=>({}));const requested=body.enemyId?String(body.enemyId):null;
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'combat.start',key);if(r.duplicate)return{duplicate:true,response:r.response};
      const [ch]=await tx`select * from game.characters where player_id=${playerId} for update`;if(!ch)throw new Error('CHARACTER_REQUIRED');
      const regenerated=await tx`select game.regenerated_value(${ch.energy},${ch.energy_max},${ch.energy_regen_anchor},180,now()) value`;
      const energy=n(regenerated[0]?.value);if(energy<1)throw new Error('NO_ENERGY');
      let enemyRows:any[];if(requested)enemyRows=await tx`select * from game.enemy_definitions where id=${requested} and realm_id=${ch.current_realm_id} and enabled`;else enemyRows=await tx`select * from game.enemy_definitions where realm_id=${ch.current_realm_id} and enabled order by abs(level-${ch.level}),tier desc,id limit 1`;
      const enemy=enemyRows[0];if(!enemy)throw new Error('ENEMY_NOT_FOUND');
      await tx`update game.characters set energy=${energy-1},energy_regen_anchor=now(),updated_at=now() where id=${ch.id}`;
      const [combat]=await tx`insert into game.combat_sessions(character_id,enemy_id,player_hp,player_mp,enemy_hp) values(${ch.id},${enemy.id},${ch.hp},${ch.mp},${enemy.max_hp}) returning *`;
      await tx`insert into game.combat_events(combat_id,turn_number,actor,event_type,payload) values(${combat.id},1,'system','combat_started',${tx.json({enemyId:enemy.id})})`;
      const response={combat,enemy};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},out.error==='NO_ENERGY'?409:404);return c.json(out,201);
  });

  app.get('/v1/combat/:combatId',async c=>{
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const id=c.req.param('combatId');const [combat]=await sql`select s.*,e.name_es enemy_name_es,e.name_en enemy_name_en,e.max_hp enemy_max_hp,e.visual_key,e.abilities from game.combat_sessions s join game.characters ch on ch.id=s.character_id left join game.enemy_definitions e on e.id=s.enemy_id where s.id=${id} and ch.player_id=${playerId}`;if(!combat)return c.json({error:'COMBAT_NOT_FOUND'},404);const events=await sql`select * from game.combat_events where combat_id=${id} order by id`;return c.json({combat,events});
  });

  app.post('/v1/combat/:combatId/action',async c=>{
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}
    const combatId=c.req.param('combatId');const key=c.req.header('idempotency-key');const body=await c.req.json().catch(()=>({}));const skillId=body.skillId?String(body.skillId):null;
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'combat.action',key);if(r.duplicate)return{duplicate:true,response:r.response};
      const [row]=await tx`select s.*,ch.level,ch.class_id,ch.player_id,st.*,e.id enemy_definition_id,e.name_es,e.max_hp enemy_max_hp,e.attack enemy_attack,e.defense enemy_defense,e.magic_resistance enemy_magic_resistance,e.speed enemy_speed,e.abilities from game.combat_sessions s join game.characters ch on ch.id=s.character_id join game.character_stats st on st.character_id=ch.id join game.enemy_definitions e on e.id=s.enemy_id where s.id=${combatId} and ch.player_id=${playerId} for update`;
      if(!row)throw new Error('COMBAT_NOT_FOUND');if(row.state!=='active')throw new Error('COMBAT_FINISHED');
      let ratio=1;let damageType:'physical'|'magic'='physical';let mpCost=0;let cooldown=0;let skillName='Ataque básico';const cds=(row.cooldowns??{}) as Record<string,number>;
      if(skillId){const [skill]=await tx`select * from game.skill_definitions where id=${skillId} and class_id=${row.class_id} and unlock_level<=${row.level} and enabled`;if(!skill)throw new Error('SKILL_LOCKED');if(n(cds[skillId])>0)throw new Error('SKILL_COOLDOWN');if(n(row.player_mp)<n(skill.mp_cost))throw new Error('NO_MP');ratio=n(skill.power_ratio);damageType=skill.damage_type==='magic'?'magic':'physical';mpCost=n(skill.mp_cost);cooldown=n(skill.cooldown_turns);skillName=skill.name_es;}
      let nextCooldowns=tickCooldowns(cds);if(skillId&&cooldown>0)nextCooldowns[skillId]=cooldown;
      const pd=resolveDamage({attacker:playerStats(row),defender:{defense:n(row.enemy_defense),magicResistance:n(row.enemy_magic_resistance),evasion:0.02,blockChance:0.02},type:damageType,powerRatio:ratio,rolls:rolls()});
      let enemyHp=Math.max(0,n(row.enemy_hp)-pd.damage);let playerHp=n(row.player_hp);let playerMp=Math.max(0,n(row.player_mp)-mpCost);const turn=n(row.turn_number);const eventPayload:any={skillId,skillName,...pd};
      await tx`insert into game.combat_events(combat_id,turn_number,actor,event_type,payload) values(${combatId},${turn},'player','action',${tx.json(eventPayload)})`;
      let state='active';let enemyEvent:any=null;
      if(enemyHp<=0){state='victory';const gold=12+n(row.level)*4;const xp=20+n(row.level)*9;await tx`insert into game.resources(character_id,resource_code,amount) values(${row.character_id},'gold',${gold}) on conflict(character_id,resource_code) do update set amount=game.resources.amount+excluded.amount,updated_at=now()`;await tx`update game.characters set experience=experience+${xp},hp=${playerHp},mp=${playerMp},updated_at=now() where id=${row.character_id}`;await tx`insert into game.combat_events(combat_id,turn_number,actor,event_type,payload) values(${combatId},${turn},'system','victory',${tx.json({gold,xp})})`;}
      else{
        const ability=chooseEnemyAction({abilities:Array.isArray(row.abilities)?row.abilities:[{type:'basic'}],hp:enemyHp,maxHp:n(row.enemy_max_hp),rng:Math.random()});const healed=applyEnemyAbility({ability,enemyHp,enemyMaxHp:n(row.enemy_max_hp)});enemyHp=healed.hp;
        if(healed.healed>0)enemyEvent={ability:ability.type,healed:healed.healed};else{const ed=resolveDamage({attacker:{...enemyStats({attack:row.enemy_attack,defense:row.enemy_defense,magic_resistance:row.enemy_magic_resistance}),physicalAttack:n(row.enemy_attack),magicAttack:n(row.enemy_attack)},defender:{defense:n(row.defense),magicResistance:n(row.magic_resistance),evasion:n(row.evasion),blockChance:n(row.block_chance)},type:'physical',powerRatio:n(ability.ratio)||1,rolls:rolls()});playerHp=Math.max(0,playerHp-ed.damage);enemyEvent={ability:ability.type,...ed};}
        await tx`insert into game.combat_events(combat_id,turn_number,actor,event_type,payload) values(${combatId},${turn},'enemy','action',${tx.json(enemyEvent)})`;if(playerHp<=0){state='defeat';await tx`update game.characters set hp=0,mp=${playerMp},hp_regen_anchor=now(),updated_at=now() where id=${row.character_id}`;}
      }
      const [updated]=await tx`update game.combat_sessions set player_hp=${playerHp},player_mp=${playerMp},enemy_hp=${enemyHp},turn_number=turn_number+1,cooldowns=${tx.json(nextCooldowns)},state=${state},finished_at=case when ${state}<>'active' then now() else null end,updated_at=now() where id=${combatId} returning *`;
      const response={combat:updated,playerEvent:eventPayload,enemyEvent};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.get('/v1/me/full-snapshot',async c=>{
    let playerId:string;try{playerId=await auth(c,requirePlayerId);}catch{return c.json({error:'UNAUTHORIZED'},401);}return c.json({snapshot:await buildSnapshot(playerId),serverTime:new Date().toISOString()});
  });
}
