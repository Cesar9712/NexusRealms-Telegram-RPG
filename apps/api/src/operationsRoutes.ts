import type { Hono } from 'hono';
import type postgres from 'postgres';

type Sql=ReturnType<typeof postgres>;
type RequirePlayerId=(authorization?:string)=>Promise<string>;
const allowedEvents=new Set(['session_start','screen_view','tutorial_step','combat_start','combat_victory','combat_defeat','level_up','quest_accept','quest_claim','craft_start','craft_claim','bastion_open','bastion_upgrade','clan_open','market_open','battlepass_open','endgame_open','settings_open','session_resume']);

export function registerOperationsRoutes(app:Hono,sql:Sql,requirePlayerId:RequirePlayerId){
  app.get('/v1/settings',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}
    await sql`insert into game.player_game_settings(player_id,language) select ${p},case when locale ilike 'en%' then 'en' else 'es' end from game.players where id=${p} on conflict do nothing`;
    const [settings]=await sql`select * from game.player_game_settings where player_id=${p}`;const [player]=await sql`select notification_preferences from game.players where id=${p}`;return c.json({settings,notifications:player?.notification_preferences??{}});
  });

  app.put('/v1/settings',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const body=await c.req.json().catch(()=>({}));
    const language=['es','en'].includes(String(body.language))?String(body.language):undefined;const graphics=['auto','low','medium','high'].includes(String(body.graphicsPreset))?String(body.graphicsPreset):undefined;
    const music=Math.max(0,Math.min(1,Number(body.musicVolume??.35)));const effects=Math.max(0,Math.min(1,Number(body.effectsVolume??.55)));if(!Number.isFinite(music)||!Number.isFinite(effects))return c.json({error:'INVALID_SETTINGS'},400);
    await sql`insert into game.player_game_settings(player_id) values(${p}) on conflict do nothing`;
    const [current]=await sql`select * from game.player_game_settings where player_id=${p}`;
    const [settings]=await sql`update game.player_game_settings set language=${language??current.language},graphics_preset=${graphics??current.graphics_preset},music_volume=${music},effects_volume=${effects},muted=${body.muted===undefined?current.muted:Boolean(body.muted)},reduced_motion=${body.reducedMotion===undefined?current.reduced_motion:Boolean(body.reducedMotion)},updated_at=now() where player_id=${p} returning *`;
    if(language)await sql`update game.players set locale=${language},updated_at=now() where id=${p}`;
    return c.json({settings});
  });

  app.put('/v1/settings/notifications',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const body=await c.req.json().catch(()=>({}));const allowed=['energy','crafting','building','boss','event','clan','reward'];const clean:Record<string,boolean>={};for(const k of allowed)if(body[k]!==undefined)clean[k]=Boolean(body[k]);const [row]=await sql`update game.players set notification_preferences=notification_preferences||${sql.json(clean)},updated_at=now() where id=${p} returning notification_preferences`;return c.json({notifications:row?.notification_preferences??{}});
  });

  app.post('/v1/onboarding/progress',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const body=await c.req.json().catch(()=>({}));const step=Math.max(0,Math.min(20,Math.floor(Number(body.step??0))));if(!Number.isFinite(step))return c.json({error:'INVALID_STEP'},400);await sql`insert into game.player_game_settings(player_id) values(${p}) on conflict do nothing`;const [row]=await sql`update game.player_game_settings set onboarding_step=greatest(onboarding_step,${step}),onboarding_complete=onboarding_complete or ${Boolean(body.complete)},updated_at=now() where player_id=${p} returning onboarding_step,onboarding_complete`;return c.json({onboarding:row});
  });

  app.post('/v1/analytics/events',async c=>{
    let p:string;try{p=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const body=await c.req.json().catch(()=>({}));const eventName=String(body.event??'').slice(0,60);if(!allowedEvents.has(eventName))return c.json({error:'INVALID_EVENT'},400);const properties=body.properties&&typeof body.properties==='object'?body.properties:{};if(JSON.stringify(properties).length>4096)return c.json({error:'EVENT_TOO_LARGE'},413);const sessionId=String(body.sessionId??'').slice(0,80)||null;await sql`insert into game.analytics_events(player_id,event_name,session_id,properties) values(${p},${eventName},${sessionId},${sql.json(properties)})`;return c.json({accepted:true},202);
  });
}
