import { serve } from '@hono/node-server';
import { SignJWT, jwtVerify } from 'jose';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import postgres from 'postgres';
import { z } from 'zod';
import { verifyTelegramInitData } from './telegram.js';
import { registerGameplayRoutes } from './gameplayRoutes.js';
import { registerSocialRoutes } from './socialRoutes.js';
import { registerAdminRoutes } from './adminRoutes.js';
import { registerExtraRoutes } from './extraRoutes.js';

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  PORT: z.coerce.number().int().positive().optional(),
});

const ClassIdSchema = z.enum(['warrior', 'mage', 'archer', 'assassin']);
const CreateCharacterSchema = z.object({
  name: z.string().trim().min(3).max(24).regex(/^[\p{L}\p{N} _'-]+$/u),
  classId: ClassIdSchema,
  appearance: z.object({
    body: z.enum(['masculine', 'feminine']).optional(),
    face: z.string().max(40).optional(),
    hair: z.string().max(40).optional(),
    hairColor: z.string().max(20).optional(),
  }).default({}),
});

const ClassStatsSchema = z.object({
  hp: z.coerce.number().int().positive(), mp: z.coerce.number().int().nonnegative(), energy: z.coerce.number().int().positive(),
  physical_attack: z.coerce.number().int().nonnegative(), magic_attack: z.coerce.number().int().nonnegative(),
  defense: z.coerce.number().int().nonnegative(), magic_resistance: z.coerce.number().int().nonnegative(), speed: z.coerce.number().int().positive(),
});

const env = EnvSchema.parse(process.env);
const sql = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
const sessionKey = new TextEncoder().encode(env.SESSION_SECRET);
const app = new Hono();

app.use('/v1/*', cors({
  origin: env.APP_URL,
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  maxAge: 86_400,
}));

async function issueSession(playerId: string, telegramUserId: number) {
  return new SignJWT({ tg: telegramUserId }).setProtectedHeader({ alg: 'HS256' }).setSubject(playerId).setIssuedAt().setExpirationTime('12h').sign(sessionKey);
}

async function requirePlayerId(authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  const { payload } = await jwtVerify(authorization.slice(7), sessionKey, { algorithms: ['HS256'] });
  if (!payload.sub) throw new Error('UNAUTHORIZED');
  const [player] = await sql`select id,is_banned from game.players where id=${payload.sub}`;
  if (!player || player.is_banned) throw new Error('UNAUTHORIZED');
  return payload.sub;
}

async function buildSnapshot(playerId: string) {
  const [playerRows, characterRows, clanRows, passRows, referralRows, earnRows, inventoryRows, resourcesRows] = await Promise.all([
    sql`select id, telegram_user_id, username, display_name, avatar_url, locale, notification_preferences from game.players where id = ${playerId}`,
    sql`select id, class_id, current_realm_id, name, level, experience, hp, hp_max, mp, mp_max, energy, energy_max, power, hp_regen_anchor, mp_regen_anchor, energy_regen_anchor, appearance from game.characters where player_id = ${playerId}`,
    sql`select c.id, c.name, c.tag, cm.role, cm.contribution from game.clan_members cm join game.clans c on c.id = cm.clan_id where cm.player_id = ${playerId}`,
    sql`select bp.season_id, bp.xp, bp.level, bp.premium_unlocked from game.battle_pass_progress bp where bp.player_id = ${playerId} order by bp.updated_at desc limit 1`,
    sql`select rp.referral_code, ra.referrer_player_id from game.referral_profiles rp left join game.referral_attributions ra on ra.referred_player_id = rp.player_id where rp.player_id = ${playerId}`,
    sql`select internal_credits from game.earn_balances where player_id = ${playerId}`,
    sql`select count(*)::int as count from game.inventory_items i join game.characters ch on ch.id = i.character_id where ch.player_id = ${playerId}`,
    sql`select r.resource_code, r.amount from game.resources r join game.characters ch on ch.id = r.character_id where ch.player_id = ${playerId} order by r.resource_code`,
  ]);
  if (!playerRows[0]) throw new Error('PLAYER_NOT_READY');
  return { serverTime: new Date().toISOString(), player: playerRows[0], character: characterRows[0] ?? null, clan: clanRows[0] ?? null, battlePass: passRows[0] ?? null, referral: referralRows[0] ?? null, earn: earnRows[0] ?? { internal_credits: 0 }, inventoryCount: inventoryRows[0]?.count ?? 0, resources: resourcesRows };
}

app.get('/health', async (c) => { await sql`select 1 as ok`; return c.json({ ok: true, service: 'nexusrealms-api', serverTime: new Date().toISOString() }); });

app.post('/v1/auth/telegram', async (c) => {
  const parsed = z.object({ initData: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_REQUEST' }, 400);
  let verified; try { verified = verifyTelegramInitData(parsed.data.initData, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS); } catch { return c.json({ error: 'INVALID_TELEGRAM_AUTH' }, 401); }
  const result = await sql.begin(async (tx) => {
    const displayName = [verified.user.first_name, verified.user.last_name].filter(Boolean).join(' ');
    const [player] = await tx`insert into game.players (telegram_user_id, username, display_name, avatar_url, locale) values (${verified.user.id}, ${verified.user.username ?? null}, ${displayName}, ${verified.user.photo_url ?? null}, ${verified.user.language_code ?? 'es'}) on conflict (telegram_user_id) do update set username=excluded.username,display_name=excluded.display_name,avatar_url=excluded.avatar_url,locale=excluded.locale,updated_at=now() returning id,telegram_user_id,is_banned`;
    if (!player || player.is_banned) throw new Error('PLAYER_BLOCKED');
    await tx`insert into game.earn_balances (player_id) values (${player.id}) on conflict do nothing`;
    await tx`insert into game.referral_profiles (player_id, referral_code) values (${player.id}, lower(substr(replace(${player.id}::text, '-', ''), 1, 10))) on conflict do nothing`;
    const referralCode = verified.startParam?.startsWith('ref_') ? verified.startParam.slice(4).toLowerCase() : null;
    if (referralCode) { const [referrer] = await tx`select player_id from game.referral_profiles where lower(referral_code)=${referralCode}`; if (referrer && String(referrer.player_id)!==String(player.id)) await tx`insert into game.referral_attributions (referred_player_id, referrer_player_id) values (${player.id},${referrer.player_id}) on conflict (referred_player_id) do nothing`; }
    return { playerId: String(player.id), telegramUserId: Number(player.telegram_user_id) };
  }).catch((error: Error) => ({ error: error.message }));
  if ('error' in result) return c.json({ error: result.error }, 403);
  return c.json({ token: await issueSession(result.playerId, result.telegramUserId), snapshot: await buildSnapshot(result.playerId) });
});

app.get('/v1/me/snapshot', async (c) => { try { return c.json(await buildSnapshot(await requirePlayerId(c.req.header('authorization')))); } catch { return c.json({ error: 'UNAUTHORIZED' }, 401); } });
app.get('/v1/classes', async (c) => c.json({ classes: await sql`select id,name_es,name_en,base_stats from game.classes where enabled order by id` }));

app.post('/v1/characters', async (c) => {
  let playerId: string; try { playerId = await requirePlayerId(c.req.header('authorization')); } catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
  const idempotencyKey=c.req.header('idempotency-key'); if(!idempotencyKey||idempotencyKey.length>120)return c.json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
  const body=CreateCharacterSchema.safeParse(await c.req.json().catch(()=>null)); if(!body.success)return c.json({error:'INVALID_CHARACTER',details:body.error.flatten()},400);
  const outcome=await sql.begin(async tx=>{
    const receipt=await tx`insert into game.action_receipts(player_id,operation,idempotency_key) values(${playerId},'character.create',${idempotencyKey}) on conflict(player_id,operation,idempotency_key) do nothing returning id`; if(!receipt[0])return{duplicate:true};
    const [existing]=await tx`select id from game.characters where player_id=${playerId} for update`;if(existing)throw new Error('CHARACTER_ALREADY_EXISTS');
    const [classRow]=await tx`select id,base_stats from game.classes where id=${body.data.classId} and enabled`;if(!classRow)throw new Error('CLASS_NOT_FOUND');const stats=ClassStatsSchema.parse(classRow.base_stats);
    const power=Math.round(stats.hp*.7+stats.mp*.35+stats.energy*.2+stats.physical_attack*12+stats.magic_attack*12+stats.defense*9+stats.magic_resistance*9+stats.speed*1.5);
    const [character]=await tx`insert into game.characters(player_id,class_id,current_realm_id,name,hp,hp_max,mp,mp_max,energy,energy_max,power,appearance) values(${playerId},${classRow.id},'ashen-frontier',${body.data.name},${stats.hp},${stats.hp},${stats.mp},${stats.mp},${stats.energy},${stats.energy},${power},${tx.json(body.data.appearance)}) returning id`;
    await tx`insert into game.character_stats(character_id,physical_attack,magic_attack,defense,magic_resistance,speed) values(${character.id},${stats.physical_attack},${stats.magic_attack},${stats.defense},${stats.magic_resistance},${stats.speed})`;
    await tx`insert into game.resources(character_id,resource_code,amount) values (${character.id},'gold',250),(${character.id},'crystals',0),(${character.id},'premium_credits',0),(${character.id},'clan_coins',0),(${character.id},'ore',8),(${character.id},'herbs',8),(${character.id},'wood',8),(${character.id},'fish',4),(${character.id},'arcane_dust',2)`;
    for(const building of ['fortress','forge','laboratory','garden','mine','pond','warehouse','market','altar','barracks','arcane-tower','workshop','portal','hall-of-heroes'])await tx`insert into game.bastion_buildings(character_id,building_code) values(${character.id},${building})`;
    const response={characterId:String(character.id),classId:String(classRow.id)};await tx`update game.action_receipts set response=${tx.json(response)} where id=${receipt[0].id}`;return{duplicate:false};
  }).catch((error:Error)=>({error:error.message}));
  if('error'in outcome)return c.json({error:outcome.error},outcome.error==='CHARACTER_ALREADY_EXISTS'?409:400);return c.json({duplicate:outcome.duplicate,snapshot:await buildSnapshot(playerId)},201);
});

app.post('/v1/realms/:realmId/travel', async (c) => {
  let playerId:string;try{playerId=await requirePlayerId(c.req.header('authorization'))}catch{return c.json({error:'UNAUTHORIZED'},401)}const realmId=c.req.param('realmId');const key=c.req.header('idempotency-key');if(!key||key.length>120)return c.json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
  const outcome=await sql.begin(async tx=>{const inserted=await tx`insert into game.action_receipts(player_id,operation,idempotency_key) values(${playerId},'realm.travel',${key}) on conflict(player_id,operation,idempotency_key) do nothing returning id`;if(!inserted[0]){const [existing]=await tx`select response from game.action_receipts where player_id=${playerId} and operation='realm.travel' and idempotency_key=${key}`;return{duplicate:true,response:existing?.response??{}}}const [character]=await tx`select id,level,current_realm_id from game.characters where player_id=${playerId} for update`;const [target]=await tx`select id,min_level from game.realms where id=${realmId} and enabled`;if(!character)throw new Error('CHARACTER_REQUIRED');if(!target)throw new Error('REALM_NOT_FOUND');if(Number(character.level)<Number(target.min_level))throw new Error('REALM_LOCKED');if(character.current_realm_id!==target.id){await tx`update game.characters set current_realm_id=${target.id},updated_at=now() where id=${character.id}`;await tx`insert into game.realm_travel_log(character_id,from_realm_id,to_realm_id) values(${character.id},${character.current_realm_id},${target.id})`;}const response={realmId:target.id,travelled:character.current_realm_id!==target.id};await tx`update game.action_receipts set response=${tx.json(response)} where id=${inserted[0].id}`;return{duplicate:false,response}}).catch((e:Error)=>({error:e.message}));
  if('error'in outcome)return c.json({error:outcome.error},outcome.error==='REALM_LOCKED'?403:outcome.error==='CHARACTER_REQUIRED'?409:404);return c.json({...outcome.response,duplicate:outcome.duplicate,snapshot:await buildSnapshot(playerId)});
});

registerGameplayRoutes(app,sql,requirePlayerId,buildSnapshot);
registerSocialRoutes(app,sql,requirePlayerId);
registerExtraRoutes(app,sql,requirePlayerId);
registerAdminRoutes(app,sql,requirePlayerId);

serve({fetch:app.fetch,port:env.PORT ?? env.API_PORT},info=>console.log(`Nexus Realms API listening on :${info.port}`));