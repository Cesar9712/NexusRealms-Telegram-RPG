import postgres from 'postgres';
import { z } from 'zod';

const Env=z.object({DATABASE_URL:z.string().min(1),TELEGRAM_BOT_TOKEN:z.string().min(20),WORKER_INTERVAL_SECONDS:z.coerce.number().int().min(30).default(60)}).parse(process.env);
const sql=postgres(Env.DATABASE_URL,{max:4,idle_timeout:20});
const owner=`worker-${process.pid}`;

async function lease(key:string,seconds:number){const rows=await sql`
 insert into game.worker_leases(key,owner,expires_at) values(${key},${owner},now()+(${seconds}||' seconds')::interval)
 on conflict(key) do update set owner=excluded.owner,expires_at=excluded.expires_at,updated_at=now()
 where game.worker_leases.expires_at<=now() or game.worker_leases.owner=${owner}
 returning key
`;return Boolean(rows[0]);}

async function telegram(chatId:string|number,text:string){const res=await fetch(`https://api.telegram.org/bot${Env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_notification:true})});if(!res.ok)throw new Error(`TELEGRAM_${res.status}`);}

async function materializeDueNotifications(){
 await sql.begin(async tx=>{
  const due=await tx`select ch.player_id,b.character_id,b.building_code,b.level,b.upgrade_finishes_at,d.name_es from game.bastion_buildings b join game.characters ch on ch.id=b.character_id left join game.bastion_building_definitions d on d.code=b.building_code where b.upgrade_finishes_at is not null and b.upgrade_finishes_at<=now() for update`;
  for(const b of due){const dedupe=`bastion:${b.character_id}:${b.building_code}:${new Date(b.upgrade_finishes_at).getTime()}`;await tx`insert into game.player_notifications(player_id,kind,payload,dedupe_key) values(${b.player_id},'bastion_complete',${tx.json({building:b.building_code,name:b.name_es,level:Number(b.level)+1})},${dedupe}) on conflict(dedupe_key) do nothing`;await tx`update game.bastion_buildings set level=level+1,upgrade_started_at=null,upgrade_finishes_at=null,updated_at=now() where character_id=${b.character_id} and building_code=${b.building_code}`;}
  const crafts=await tx`select * from game.v_finished_crafting_notifications`;
  for(const j of crafts)await tx`insert into game.player_notifications(player_id,kind,payload,dedupe_key) values(${j.player_id},'craft_ready',${tx.json({jobId:j.job_id,recipeId:j.recipe_id})},${j.dedupe_key}) on conflict(dedupe_key) do nothing`;
  const energy=await tx`select p.id player_id,ch.id character_id,ch.energy,ch.energy_max,ch.energy_regen_anchor,p.notification_preferences from game.characters ch join game.players p on p.id=ch.player_id where ch.energy<ch.energy_max and game.regenerated_value(ch.energy,ch.energy_max,ch.energy_regen_anchor,180,now())>=ch.energy_max`;
  for(const e of energy){const day=new Date().toISOString().slice(0,10);await tx`insert into game.player_notifications(player_id,kind,payload,dedupe_key) values(${e.player_id},'energy_full','{}',${`energy:${e.character_id}:${day}`}) on conflict(dedupe_key) do nothing`;await tx`update game.characters set energy=energy_max,energy_regen_anchor=now(),updated_at=now() where id=${e.character_id}`;}
 });
}

async function refreshRankings(){await sql`select game.refresh_power_ranking()`;}

async function deliverNotifications(){
 const rows=await sql`select n.id,n.kind,n.payload,p.telegram_user_id,p.notification_preferences from game.player_notifications n join game.players p on p.id=n.player_id where n.delivered_at is null and n.deliver_after<=now() order by n.created_at limit 50`;
 for(const row of rows){
  const prefs=(row.notification_preferences??{}) as Record<string,unknown>;if(prefs[row.kind]===false){await sql`update game.player_notifications set delivered_at=now() where id=${row.id}`;continue;}
  const payload=row.payload??{};let text='⚔️ <b>Nexus Realms</b>\n';
  if(row.kind==='bastion_complete')text+=`🏰 ${payload.name??payload.building} alcanzó nivel ${payload.level}.`;
  else if(row.kind==='craft_ready')text+='🔨 Tu fabricación ha terminado y está lista para reclamar.';
  else if(row.kind==='energy_full')text+='⚡ Tu energía está completa.';
  else text+='Tienes una nueva actualización en el juego.';
  try{await telegram(row.telegram_user_id,text);await sql`update game.player_notifications set delivered_at=now() where id=${row.id}`;}catch(error){console.error('notification delivery failed',row.id,error);}
 }
}

async function run(){if(!(await lease('main-loop',Math.max(90,Env.WORKER_INTERVAL_SECONDS*2))))return;const [job]=await sql`insert into game.job_runs(job_name) values('main-loop') returning id`;try{await materializeDueNotifications();await refreshRankings();await deliverNotifications();await sql`update game.job_runs set status='success',finished_at=now() where id=${job.id}`;}catch(error){console.error(error);await sql`update game.job_runs set status='failed',finished_at=now(),details=${sql.json({error:error instanceof Error?error.message:String(error)})} where id=${job.id}`;}}

void run();setInterval(()=>void run(),Env.WORKER_INTERVAL_SECONDS*1000);
