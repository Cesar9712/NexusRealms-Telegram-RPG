import type { Hono } from 'hono';
import type postgres from 'postgres';

type Sql=ReturnType<typeof postgres>;
type RequirePlayerId=(authorization?:string)=>Promise<string>;
const n=(v:unknown)=>Number(v??0);
const allowedStats=['strength','vitality','agility','intelligence','luck'] as const;
type Stat=typeof allowedStats[number];
const tactics=['smart','balanced','aggressive','defensive'] as const;

async function receipt(tx:any,playerId:string,operation:string,key?:string){
  if(!key||key.length>120)throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const rows=await tx`insert into game.action_receipts(player_id,operation,idempotency_key) values(${playerId},${operation},${key}) on conflict(player_id,operation,idempotency_key) do nothing returning id`;
  if(rows[0])return{id:rows[0].id,duplicate:false,response:null};
  const [old]=await tx`select response from game.action_receipts where player_id=${playerId} and operation=${operation} and idempotency_key=${key}`;
  return{id:null,duplicate:true,response:old?.response??{}};
}

async function loadProgression(sql:any,playerId:string){
  const [row]=await sql`
    select ch.id character_id,ch.class_id,ch.level,ch.experience,ch.hp,ch.hp_max,ch.mp,ch.mp_max,ch.energy,ch.energy_max,ch.power,
           cp.tactic,cp.strength_allocated,cp.vitality_allocated,cp.agility_allocated,cp.intelligence_allocated,cp.luck_allocated,
           ap.strength base_strength,ap.vitality base_vitality,ap.agility base_agility,ap.intelligence base_intelligence,ap.luck base_luck,
           st.physical_attack,st.magic_attack,st.defense,st.magic_resistance,st.crit_chance,st.crit_damage,st.accuracy,st.evasion,st.speed,st.block_chance
    from game.characters ch
    join game.character_progression cp on cp.character_id=ch.id
    join game.class_attribute_profiles ap on ap.class_id=ch.class_id
    join game.character_stats st on st.character_id=ch.id
    where ch.player_id=${playerId}
  `;
  if(!row)throw new Error('CHARACTER_REQUIRED');
  const allocated={strength:n(row.strength_allocated),vitality:n(row.vitality_allocated),agility:n(row.agility_allocated),intelligence:n(row.intelligence_allocated),luck:n(row.luck_allocated)};
  const spent=Object.values(allocated).reduce((a,b)=>a+b,0);
  const earned=Math.max(0,(n(row.level)-1)*2);
  const attributes={
    strength:n(row.base_strength)+allocated.strength,
    vitality:n(row.base_vitality)+allocated.vitality,
    agility:n(row.base_agility)+allocated.agility,
    intelligence:n(row.base_intelligence)+allocated.intelligence,
    luck:n(row.base_luck)+allocated.luck,
  };
  const skills=await sql`select id,name_es,name_en,description_es,description_en,damage_type,power_ratio,mp_cost,cooldown_turns,unlock_level from game.skill_definitions where class_id=${row.class_id} and enabled order by unlock_level,id`;
  return{
    level:n(row.level),experience:n(row.experience),nextLevelAt:n(row.level)*300,
    tactic:row.tactic,attributes,allocated,points:{earned,spent,available:Math.max(0,earned-spent)},
    combat:{hp:n(row.hp),hpMax:n(row.hp_max),mp:n(row.mp),mpMax:n(row.mp_max),energy:n(row.energy),energyMax:n(row.energy_max),power:n(row.power),physicalAttack:n(row.physical_attack),magicAttack:n(row.magic_attack),defense:n(row.defense),magicResistance:n(row.magic_resistance),critChance:n(row.crit_chance),critDamage:n(row.crit_damage),evasion:n(row.evasion),speed:n(row.speed),blockChance:n(row.block_chance)},
    skills,
  };
}

async function recalcPower(tx:any,characterId:string){
  const [r]=await tx`select ch.hp_max,ch.mp_max,ch.energy_max,st.physical_attack,st.magic_attack,st.defense,st.magic_resistance,st.speed from game.characters ch join game.character_stats st on st.character_id=ch.id where ch.id=${characterId}`;
  if(!r)return;
  const power=Math.round(n(r.hp_max)*.7+n(r.mp_max)*.35+n(r.energy_max)*.2+n(r.physical_attack)*12+n(r.magic_attack)*12+n(r.defense)*9+n(r.magic_resistance)*9+n(r.speed)*1.5);
  await tx`update game.characters set power=${power},updated_at=now() where id=${characterId}`;
}

export function registerProgressionRoutes(app:Hono,sql:Sql,requirePlayerId:RequirePlayerId){
  app.get('/v1/progression',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const [ch]=await sql`select id from game.characters where player_id=${playerId}`;if(!ch)return c.json({error:'CHARACTER_REQUIRED'},409);
    await sql`insert into game.character_progression(character_id) values(${ch.id}) on conflict do nothing`;
    try{return c.json(await loadProgression(sql,playerId))}catch(e:any){return c.json({error:e.message},409)}
  });

  app.post('/v1/progression/allocate',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const body=await c.req.json().catch(()=>({}));const stat=String(body.stat??'') as Stat;if(!allowedStats.includes(stat))return c.json({error:'INVALID_STAT'},400);
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'progression.allocate',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};
      const [ch]=await tx`select id,level from game.characters where player_id=${playerId} for update`;if(!ch)throw new Error('CHARACTER_REQUIRED');
      await tx`insert into game.character_progression(character_id) values(${ch.id}) on conflict do nothing`;
      const [p]=await tx`select * from game.character_progression where character_id=${ch.id} for update`;
      const spent=n(p.strength_allocated)+n(p.vitality_allocated)+n(p.agility_allocated)+n(p.intelligence_allocated)+n(p.luck_allocated);
      if(Math.max(0,(n(ch.level)-1)*2-spent)<1)throw new Error('NO_ATTRIBUTE_POINTS');
      if(stat==='strength'){
        await tx`update game.character_progression set strength_allocated=strength_allocated+1,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.character_stats set physical_attack=physical_attack+2,updated_at=now() where character_id=${ch.id}`;
      }else if(stat==='vitality'){
        await tx`update game.character_progression set vitality_allocated=vitality_allocated+1,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.character_stats set defense=defense+1,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.characters set hp_max=hp_max+3,hp=least(hp_max+3,hp+3),updated_at=now() where id=${ch.id}`;
      }else if(stat==='agility'){
        await tx`update game.character_progression set agility_allocated=agility_allocated+1,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.character_stats set speed=speed+1,crit_chance=least(0.75,crit_chance+0.002),evasion=least(0.65,evasion+0.0015),updated_at=now() where character_id=${ch.id}`;
      }else if(stat==='intelligence'){
        await tx`update game.character_progression set intelligence_allocated=intelligence_allocated+1,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.character_stats set magic_attack=magic_attack+2,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.characters set mp_max=mp_max+2,mp=least(mp_max+2,mp+2),updated_at=now() where id=${ch.id}`;
      }else{
        await tx`update game.character_progression set luck_allocated=luck_allocated+1,updated_at=now() where character_id=${ch.id}`;
        await tx`update game.character_stats set crit_chance=least(0.75,crit_chance+0.0015),crit_damage=least(3.0,crit_damage+0.002),updated_at=now() where character_id=${ch.id}`;
      }
      await recalcPower(tx,String(ch.id));
      const response={allocated:true,stat};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},409);return c.json({...out,progression:await loadProgression(sql,playerId)});
  });

  app.post('/v1/progression/tactic',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const body=await c.req.json().catch(()=>({}));const tactic=String(body.tactic??'');if(!tactics.includes(tactic as any))return c.json({error:'INVALID_TACTIC'},400);
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'progression.tactic',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};
      const [ch]=await tx`select id from game.characters where player_id=${playerId}`;if(!ch)throw new Error('CHARACTER_REQUIRED');
      await tx`insert into game.character_progression(character_id,tactic) values(${ch.id},${tactic}) on conflict(character_id) do update set tactic=excluded.tactic,updated_at=now()`;
      const response={tactic};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));if('error'in out)return c.json({error:out.error},409);return c.json({...out,progression:await loadProgression(sql,playerId)});
  });

  app.get('/v1/profession-tree',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const [ch]=await sql`select id,level from game.characters where player_id=${playerId}`;if(!ch)return c.json({error:'CHARACTER_REQUIRED'},409);
    await sql`insert into game.profession_progress(character_id,profession_id) select ${ch.id},id from game.profession_definitions where enabled on conflict do nothing`;
    const professions=await sql`select d.id,d.name_es,d.name_en,d.gathering,d.max_level,p.level,p.experience,p.specialization from game.profession_definitions d join game.profession_progress p on p.profession_id=d.id and p.character_id=${ch.id} where d.enabled order by d.gathering desc,d.id`;
    const talents=await sql`select d.*,coalesce(t.rank,0)::int rank from game.profession_talent_definitions d left join game.character_profession_talents t on t.talent_id=d.id and t.character_id=${ch.id} where d.enabled order by d.profession_id,d.tier,d.position,d.id`;
    const spent=(await sql`select coalesce(sum(rank),0)::int spent from game.character_profession_talents where character_id=${ch.id}`)[0]?.spent??0;
    const earned=Math.max(0,(n(ch.level)-1)*2);
    return c.json({professions,talents,points:{earned,spent:n(spent),available:Math.max(0,earned-n(spent))}});
  });

  app.post('/v1/profession-tree/:talentId/allocate',async c=>{
    let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    const talentId=c.req.param('talentId');
    const out=await sql.begin(async tx=>{
      const r=await receipt(tx,playerId,'profession.talent.allocate',c.req.header('idempotency-key'));if(r.duplicate)return{duplicate:true,response:r.response};
      const [ch]=await tx`select id,level from game.characters where player_id=${playerId} for update`;if(!ch)throw new Error('CHARACTER_REQUIRED');
      const [talent]=await tx`select * from game.profession_talent_definitions where id=${talentId} and enabled`;if(!talent)throw new Error('TALENT_NOT_FOUND');
      await tx`insert into game.profession_progress(character_id,profession_id) values(${ch.id},${talent.profession_id}) on conflict do nothing`;
      const [profession]=await tx`select level from game.profession_progress where character_id=${ch.id} and profession_id=${talent.profession_id} for update`;
      if(n(profession?.level)<n(talent.required_profession_level))throw new Error('PROFESSION_LEVEL_REQUIRED');
      if(talent.prerequisite_id){const [prereq]=await tx`select rank from game.character_profession_talents where character_id=${ch.id} and talent_id=${talent.prerequisite_id}`;if(n(prereq?.rank)<1)throw new Error('TALENT_PREREQUISITE_REQUIRED');}
      const [current]=await tx`select rank from game.character_profession_talents where character_id=${ch.id} and talent_id=${talentId} for update`;
      if(n(current?.rank)>=n(talent.max_rank))throw new Error('TALENT_MAXED');
      const [spentRow]=await tx`select coalesce(sum(rank),0)::int spent from game.character_profession_talents where character_id=${ch.id}`;
      if(Math.max(0,(n(ch.level)-1)*2-n(spentRow?.spent))<1)throw new Error('NO_PROFESSION_POINTS');
      await tx`insert into game.character_profession_talents(character_id,talent_id,rank) values(${ch.id},${talentId},1) on conflict(character_id,talent_id) do update set rank=game.character_profession_talents.rank+1,updated_at=now()`;
      const response={allocated:true,talentId};await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;return{duplicate:false,response};
    }).catch((e:Error)=>({error:e.message}));
    if('error'in out)return c.json({error:out.error},409);return c.json(out);
  });
}
