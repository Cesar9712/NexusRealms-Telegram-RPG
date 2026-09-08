import type { Hono } from 'hono';
import type postgres from 'postgres';

type Sql=ReturnType<typeof postgres>;
type RequirePlayerId=(authorization?:string)=>Promise<string>;
const n=(v:unknown)=>Number(v??0);
const key=(c:any)=>c.req.header('idempotency-key');

async function receipt(tx:any,playerId:string,operation:string,idempotencyKey?:string){
  if(!idempotencyKey||idempotencyKey.length>120)throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const rows=await tx`insert into game.action_receipts(player_id,operation,idempotency_key) values(${playerId},${operation},${idempotencyKey}) on conflict(player_id,operation,idempotency_key) do nothing returning id`;
  if(rows[0])return{id:rows[0].id,duplicate:false,response:null};
  const [old]=await tx`select response from game.action_receipts where player_id=${playerId} and operation=${operation} and idempotency_key=${idempotencyKey}`;
  return{id:null,duplicate:true,response:old?.response??{}};
}
async function addResource(tx:any,characterId:string,code:string,amount:number){
  const qty=Math.floor(Math.max(0,amount));if(!qty)return;
  await tx`insert into game.resources(character_id,resource_code,amount) values(${characterId},${code},${qty}) on conflict(character_id,resource_code) do update set amount=game.resources.amount+excluded.amount,updated_at=now()`;
}
async function grantReward(tx:any,ch:any,reward:any){
  const r=reward&&typeof reward==='object'?reward:{};
  await addResource(tx,ch.id,'gold',n(r.gold));
  await addResource(tx,ch.id,'crystals',n(r.crystals));
  await addResource(tx,ch.id,'arcane_dust',n(r.arcane_dust));
  if(r.resources&&typeof r.resources==='object')for(const [code,amount] of Object.entries(r.resources))await addResource(tx,ch.id,String(code),n(amount));
  if(n(r.xp)>0)await tx`update game.characters set experience=experience+${Math.floor(n(r.xp))},updated_at=now() where id=${ch.id}`;
  if(typeof r.item==='string'){
    const [def]=await tx`select id from game.item_definitions where id=${r.item} and enabled`;
    if(def)await tx`insert into game.inventory_items(character_id,item_definition_id) values(${ch.id},${r.item})`;
  }
}
async function characterForUpdate(tx:any,playerId:string){
  const [ch]=await tx`select ch.*,st.physical_attack,st.magic_attack,st.defense,st.magic_resistance,st.speed from game.characters ch join game.character_stats st on st.character_id=ch.id where ch.player_id=${playerId} for update`;
  if(!ch)throw new Error('CHARACTER_REQUIRED');return ch;
}
async function spendEnergy(tx:any,ch:any,cost:number){
  const [regen]=await tx`select game.regenerated_value(${ch.energy},${ch.energy_max},${ch.energy_regen_anchor},180,now()) value`;
  const energy=n(regen?.value);if(energy<cost)throw new Error('NO_ENERGY');
  await tx`update game.characters set energy=${energy-cost},energy_regen_anchor=now(),updated_at=now() where id=${ch.id}`;
  return energy-cost;
}

export function registerEndgameRoutes(app:Hono,sql:Sql,requirePlayerId:RequirePlayerId){
  app.get('/v1/endgame',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const [ch]=await sql`select id,level,current_realm_id,power from game.characters where player_id=${p}`;if(!ch)return c.json({error:'CHARACTER_REQUIRED'},409);
    await sql`insert into game.tower_progress(character_id) values(${ch.id}) on conflict do nothing`;
    const [dungeons,runs,bosses,expDefs,expeditions,tower]=await Promise.all([
      sql`select * from game.dungeon_definitions where enabled and min_level<=${ch.level} order by min_level,difficulty`,
      sql`select r.*,d.name_es,d.difficulty,d.room_count from game.dungeon_runs r join game.dungeon_definitions d on d.id=r.dungeon_id where r.character_id=${ch.id} order by r.started_at desc limit 12`,
      sql`select id,realm_id,name_es,name_en,boss_type,level,max_hp,attack,defense,magic_resistance,phases,lore_es,visual_key from game.boss_definitions where enabled and realm_id=${ch.current_realm_id} order by level`,
      sql`select * from game.expedition_definitions where enabled and min_level<=${ch.level} order by min_level,duration_seconds`,
      sql`select e.*,d.name_es,d.rewards from game.expeditions e join game.expedition_definitions d on d.id=e.expedition_id where e.character_id=${ch.id} and e.status='running' order by e.finishes_at`,
      sql`select * from game.tower_progress where character_id=${ch.id}`,
    ]);
    return c.json({serverTime:new Date().toISOString(),character:{level:ch.level,power:ch.power,realmId:ch.current_realm_id},dungeons,runs,bosses,expeditionDefinitions:expDefs,expeditions,tower:tower[0]??null});
  });

  app.post('/v1/bosses/:bossId/challenge',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const bossId=c.req.param('bossId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'boss.challenge',key(c));if(r.duplicate)return{duplicate:true,response:r.response};
      const ch=await characterForUpdate(tx,p);
      const [boss]=await tx`select * from game.boss_definitions where id=${bossId} and enabled`;if(!boss)throw new Error('BOSS_NOT_FOUND');if(String(boss.realm_id)!==String(ch.current_realm_id))throw new Error('BOSS_WRONG_REALM');if(n(ch.level)+3<n(boss.level))throw new Error('BOSS_LEVEL_REQUIRED');
      await spendEnergy(tx,ch,2);
      const required=Math.max(500,Math.round(n(boss.level)*150+n(boss.max_hp)*1.35+n(boss.attack)*14+n(boss.defense)*8+n(boss.magic_resistance)*8));
      const roll=.88+Math.random()*.28;const effective=Math.round(n(ch.power)*roll);const won=effective>=Math.round(required*.82);
      const rawPhases=Array.isArray(boss.phases)?boss.phases:[];const phases=(rawPhases.length?rawPhases:[{threshold:.70,mechanic:'ruptura'},{threshold:.35,mechanic:'enrage'},{threshold:0,mechanic:'final'}]).slice(0,5);
      const phaseLog=phases.map((phase:any,index:number)=>({phase:index+1,mechanic:phase.type??phase.mechanic??phase.name??'phase_shift',threshold:phase.threshold??phase.hp_threshold??Math.max(0,.7-index*.3),survived:won||index<Math.max(1,Math.floor(phases.length/2))}));
      const relic=`boss-relic-${String(boss.realm_id).replace('ashen-frontier','ashen').replace('cursed-grove','grove').replace('ironpeaks','iron').replace('spectral-marsh','spectral').replace('crimson-wastes','crimson').replace('frostbound','frost').replace('abyss','abyss').replace('celestial','celestial').replace('chaos','chaos')}`;
      const reward:any=won?{gold:180+n(boss.level)*18,xp:140+n(boss.level)*24,resources:{boss_essence:1+Math.floor(n(boss.level)/20)}}:{};
      if(won&&Math.random()<.18)reward.item=relic;
      if(won){await grantReward(tx,ch,reward);await tx`select game.progress_quest_counter(${ch.id},'boss',1)`;await tx`select game.progress_achievement_metric(${ch.id},'boss_kills',1)`;await tx`select game.add_battle_pass_xp(${p},35)`;await tx`insert into game.character_codex(character_id,codex_id,progress) values(${ch.id},${`boss:${boss.id}`},1) on conflict(character_id,codex_id) do update set progress=game.character_codex.progress+1`;}
      const [enc]=await tx`insert into game.boss_encounters(player_id,character_id,boss_id,won,player_power,required_power,phase_log,reward) values(${p},${ch.id},${boss.id},${won},${ch.power},${required},${tx.json(phaseLog)},${tx.json(reward)}) returning id,created_at`;
      const response={encounterId:enc.id,won,boss:{id:boss.id,name_es:boss.name_es,level:boss.level},requiredPower:required,effectivePower:effective,phaseLog,reward};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.post('/v1/dungeons/:dungeonId/start',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const dungeonId=c.req.param('dungeonId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'dungeon.start',key(c));if(r.duplicate)return{duplicate:true,response:r.response};const ch=await characterForUpdate(tx,p);
      const [d]=await tx`select * from game.dungeon_definitions where id=${dungeonId} and enabled`;if(!d)throw new Error('DUNGEON_NOT_FOUND');if(n(ch.level)<n(d.min_level))throw new Error('DUNGEON_LEVEL_REQUIRED');
      const [active]=await tx`select id from game.dungeon_runs where character_id=${ch.id} and state='active'`;if(active)throw new Error('DUNGEON_ALREADY_ACTIVE');
      const [daily]=await tx`select count(*)::int total from game.dungeon_runs where character_id=${ch.id} and dungeon_id=${dungeonId} and started_at>=date_trunc('day',now())`;if(n(daily?.total)>=n(d.daily_limit))throw new Error('DUNGEON_DAILY_LIMIT');
      await spendEnergy(tx,ch,n(d.energy_cost));const [run]=await tx`insert into game.dungeon_runs(player_id,character_id,dungeon_id) values(${p},${ch.id},${dungeonId}) returning *`;const response={run,dungeon:d};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out,201);
  });

  app.post('/v1/dungeons/runs/:runId/advance',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const runId=c.req.param('runId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'dungeon.advance',key(c));if(r.duplicate)return{duplicate:true,response:r.response};
      const [row]=await tx`select r.*,d.room_count,d.min_level,d.power_multiplier,ch.power from game.dungeon_runs r join game.dungeon_definitions d on d.id=r.dungeon_id join game.characters ch on ch.id=r.character_id where r.id=${runId} and r.player_id=${p} for update`;if(!row)throw new Error('DUNGEON_RUN_NOT_FOUND');if(row.state!=='active')throw new Error('DUNGEON_RUN_CLOSED');
      const nextRoom=n(row.room_index)+1;const required=Math.round((300+n(row.min_level)*105+nextRoom*90)*n(row.power_multiplier));const chance=Math.max(.28,Math.min(.92,n(row.power)/(Math.max(1,n(row.power)+required))+.32));const won=Math.random()<chance;const completed=won&&nextRoom>=n(row.room_count);const score=n(row.score)+(won?Math.round(required*.7):0);
      const state=won?(completed?'completed':'active'):'failed';const result={room:nextRoom,won,completed,requiredPower:required,chance:Number(chance.toFixed(3))};
      await tx`update game.dungeon_runs set room_index=${nextRoom},score=${score},state=${state},completed_at=case when ${state}<>'active' then now() else null end,result=${tx.json(result)} where id=${runId}`;
      if(won)await tx`select game.add_battle_pass_xp(${p},${completed?24:6})`;
      const response={...result,state,score};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.post('/v1/dungeons/runs/:runId/claim',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const runId=c.req.param('runId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'dungeon.claim',key(c));if(r.duplicate)return{duplicate:true,response:r.response};
      const [row]=await tx`select r.*,d.rewards,ch.* from game.dungeon_runs r join game.dungeon_definitions d on d.id=r.dungeon_id join game.characters ch on ch.id=r.character_id where r.id=${runId} and r.player_id=${p} for update`;if(!row)throw new Error('DUNGEON_RUN_NOT_FOUND');if(row.state!=='completed'||row.claimed_at)throw new Error('DUNGEON_REWARD_UNAVAILABLE');
      await grantReward(tx,row,row.rewards);await tx`update game.dungeon_runs set state='claimed',claimed_at=now() where id=${runId}`;await tx`select game.progress_achievement_metric(${row.id},'discoveries',1)`;const response={claimed:true,reward:row.rewards,score:row.score};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.post('/v1/tower/challenge',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'tower.challenge',key(c));if(r.duplicate)return{duplicate:true,response:r.response};const ch=await characterForUpdate(tx,p);
      await tx`insert into game.tower_progress(character_id) values(${ch.id}) on conflict do nothing`;await tx`update game.tower_progress set attempts_today=0,attempts_date=current_date where character_id=${ch.id} and attempts_date<>current_date`;
      const [tp]=await tx`select * from game.tower_progress where character_id=${ch.id} for update`;if(n(tp.attempts_today)>=10)throw new Error('TOWER_DAILY_LIMIT');
      const floor=n(tp.current_floor);const required=Math.round(520+floor*145+Math.pow(floor,1.25)*16);const chance=Math.max(.22,Math.min(.90,n(ch.power)/(Math.max(1,n(ch.power)+required))+.30));const won=Math.random()<chance;const nextFloor=won?floor+1:floor;const checkpoint=won&&floor%5===0?floor:n(tp.checkpoint_floor);
      await tx`update game.tower_progress set current_floor=${nextFloor},best_floor=greatest(best_floor,${won?floor:0}),checkpoint_floor=greatest(checkpoint_floor,${checkpoint}),attempts_today=attempts_today+1,attempts_date=current_date,updated_at=now() where character_id=${ch.id}`;
      const reward:any=won?{gold:10+floor*4,xp:12+floor*3}:{};let milestone=false;if(won&&floor%5===0){const inserted=await tx`insert into game.tower_floor_claims(character_id,floor,reward) values(${ch.id},${floor},${tx.json({crystals:1+Math.floor(floor/20),gold:100+floor*8})}) on conflict do nothing returning floor`;if(inserted[0]){milestone=true;reward.crystals=1+Math.floor(floor/20);reward.gold+=100+floor*8;}}
      if(won){await grantReward(tx,ch,reward);await tx`select game.add_battle_pass_xp(${p},${milestone?20:5})`;}
      const response={floor,won,nextFloor,requiredPower:required,chance:Number(chance.toFixed(3)),milestone,reward,attemptsRemaining:Math.max(0,9-n(tp.attempts_today))};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });

  app.post('/v1/expeditions/:expeditionId/start',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const expeditionId=c.req.param('expeditionId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'expedition.start',key(c));if(r.duplicate)return{duplicate:true,response:r.response};const ch=await characterForUpdate(tx,p);const [d]=await tx`select * from game.expedition_definitions where id=${expeditionId} and enabled`;if(!d)throw new Error('EXPEDITION_NOT_FOUND');if(n(ch.level)<n(d.min_level))throw new Error('EXPEDITION_LEVEL_REQUIRED');const [count]=await tx`select count(*)::int total from game.expeditions where character_id=${ch.id} and status='running'`;if(n(count?.total)>=2)throw new Error('EXPEDITION_SLOTS_FULL');await spendEnergy(tx,ch,n(d.energy_cost));const [exp]=await tx`insert into game.expeditions(character_id,expedition_id,finishes_at) values(${ch.id},${expeditionId},now()+(${n(d.duration_seconds)}||' seconds')::interval) returning *`;const response={expedition:exp,name_es:d.name_es};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out,201);
  });

  app.post('/v1/expeditions/runs/:runId/claim',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const runId=c.req.param('runId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,p,'expedition.claim',key(c));if(r.duplicate)return{duplicate:true,response:r.response};const [row]=await tx`select e.*,d.rewards,ch.* from game.expeditions e join game.expedition_definitions d on d.id=e.expedition_id join game.characters ch on ch.id=e.character_id where e.id=${runId} and ch.player_id=${p} for update`;if(!row)throw new Error('EXPEDITION_NOT_FOUND');if(row.status!=='running'||row.claimed_at)throw new Error('EXPEDITION_CLOSED');if(new Date(row.finishes_at).getTime()>Date.now())throw new Error('NOT_READY');await grantReward(tx,row,row.rewards);await tx`update game.expeditions set status='claimed',claimed_at=now(),result=${tx.json({reward:row.rewards})} where id=${runId}`;await tx`select game.add_battle_pass_xp(${p},10)`;const response={claimed:true,reward:row.rewards};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });
}
