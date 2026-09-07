import { serve } from '@hono/node-server';
import { SignJWT, jwtVerify } from 'jose';
import { Hono } from 'hono';
import postgres from 'postgres';
import { z } from 'zod';
import { verifyTelegramInitData } from './telegram.js';

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().int().positive().default(3001),
});

const env = EnvSchema.parse(process.env);
const sql = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
const sessionKey = new TextEncoder().encode(env.SESSION_SECRET);
const app = new Hono();

async function issueSession(playerId: string, telegramUserId: number) {
  return new SignJWT({ tg: telegramUserId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(playerId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(sessionKey);
}

async function requirePlayerId(authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  const token = authorization.slice(7);
  const { payload } = await jwtVerify(token, sessionKey, { algorithms: ['HS256'] });
  if (!payload.sub) throw new Error('UNAUTHORIZED');
  return payload.sub;
}

async function buildSnapshot(playerId: string) {
  const [playerRows, characterRows, clanRows, passRows, referralRows, earnRows, inventoryRows, resourcesRows] = await Promise.all([
    sql`select id, telegram_user_id, username, display_name, avatar_url, locale, notification_preferences from game.players where id = ${playerId}`,
    sql`select id, class_id, current_realm_id, name, level, experience, hp, hp_max, mp, mp_max, energy, energy_max, power, hp_regen_anchor, mp_regen_anchor, energy_regen_anchor from game.characters where player_id = ${playerId}`,
    sql`select c.id, c.name, c.tag, cm.role, cm.contribution from game.clan_members cm join game.clans c on c.id = cm.clan_id where cm.player_id = ${playerId}`,
    sql`select bp.season_id, bp.xp, bp.level, bp.premium_unlocked from game.battle_pass_progress bp where bp.player_id = ${playerId} order by bp.updated_at desc limit 1`,
    sql`select rp.referral_code, ra.referrer_player_id from game.referral_profiles rp left join game.referral_attributions ra on ra.referred_player_id = rp.player_id where rp.player_id = ${playerId}`,
    sql`select internal_credits from game.earn_balances where player_id = ${playerId}`,
    sql`select count(*)::int as count from game.inventory_items i join game.characters ch on ch.id = i.character_id where ch.player_id = ${playerId}`,
    sql`select r.resource_code, r.amount from game.resources r join game.characters ch on ch.id = r.character_id where ch.player_id = ${playerId} order by r.resource_code`,
  ]);

  if (!playerRows[0] || !characterRows[0]) throw new Error('PLAYER_NOT_READY');
  return {
    serverTime: new Date().toISOString(),
    player: playerRows[0],
    character: characterRows[0],
    clan: clanRows[0] ?? null,
    battlePass: passRows[0] ?? null,
    referral: referralRows[0] ?? null,
    earn: earnRows[0] ?? { internal_credits: 0 },
    inventoryCount: inventoryRows[0]?.count ?? 0,
    resources: resourcesRows,
  };
}

app.get('/health', async (c) => {
  await sql`select 1 as ok`;
  return c.json({ ok: true, service: 'nexusrealms-api', serverTime: new Date().toISOString() });
});

app.post('/v1/auth/telegram', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ initData: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return c.json({ error: 'INVALID_REQUEST' }, 400);

  let verified;
  try {
    verified = verifyTelegramInitData(
      parsed.data.initData,
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
  } catch {
    return c.json({ error: 'INVALID_TELEGRAM_AUTH' }, 401);
  }

  const result = await sql.begin(async (tx) => {
    const displayName = [verified.user.first_name, verified.user.last_name].filter(Boolean).join(' ');
    const [player] = await tx`
      insert into game.players (telegram_user_id, username, display_name, avatar_url, locale)
      values (${verified.user.id}, ${verified.user.username ?? null}, ${displayName}, ${verified.user.photo_url ?? null}, ${verified.user.language_code ?? 'es'})
      on conflict (telegram_user_id) do update
      set username = excluded.username,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          locale = excluded.locale,
          updated_at = now()
      returning id, telegram_user_id
    `;

    if (!player) throw new Error('PLAYER_UPSERT_FAILED');

    let [character] = await tx`select id from game.characters where player_id = ${player.id}`;
    if (!character) {
      [character] = await tx`
        insert into game.characters (
          player_id, class_id, current_realm_id, name,
          hp, hp_max, mp, mp_max, energy, energy_max, power
        ) values (
          ${player.id}, 'warrior', 'ashen-frontier', ${displayName},
          140, 140, 70, 70, 100, 100, 100
        ) returning id
      `;
      await tx`
        insert into game.character_stats (character_id, physical_attack, magic_attack, defense, magic_resistance, speed)
        values (${character.id}, 16, 5, 14, 8, 90)
      `;
      await tx`
        insert into game.resources (character_id, resource_code, amount) values
          (${character.id}, 'gold', 250),
          (${character.id}, 'crystals', 0),
          (${character.id}, 'premium_credits', 0),
          (${character.id}, 'clan_coins', 0)
      `;
      await tx`insert into game.earn_balances (player_id) values (${player.id}) on conflict do nothing`;
      await tx`
        insert into game.referral_profiles (player_id, referral_code)
        values (${player.id}, lower(substr(replace(${player.id}::text, '-', ''), 1, 10)))
        on conflict do nothing
      `;
    }

    return { playerId: String(player.id), telegramUserId: Number(player.telegram_user_id) };
  });

  const token = await issueSession(result.playerId, result.telegramUserId);
  const snapshot = await buildSnapshot(result.playerId);
  return c.json({ token, snapshot });
});

app.get('/v1/me/snapshot', async (c) => {
  try {
    const playerId = await requirePlayerId(c.req.header('authorization'));
    return c.json(await buildSnapshot(playerId));
  } catch {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }
});

app.post('/v1/realms/:realmId/travel', async (c) => {
  let playerId: string;
  try {
    playerId = await requirePlayerId(c.req.header('authorization'));
  } catch {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  const realmId = c.req.param('realmId');
  const idempotencyKey = c.req.header('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 120) {
    return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
  }

  const outcome = await sql.begin(async (tx) => {
    const inserted = await tx`
      insert into game.action_receipts (player_id, operation, idempotency_key)
      values (${playerId}, 'realm.travel', ${idempotencyKey})
      on conflict (player_id, operation, idempotency_key) do nothing
      returning id
    `;

    if (!inserted[0]) {
      const [existing] = await tx`
        select response from game.action_receipts
        where player_id = ${playerId} and operation = 'realm.travel' and idempotency_key = ${idempotencyKey}
      `;
      return { duplicate: true, response: existing?.response ?? {} };
    }

    const [character] = await tx`
      select ch.id, ch.level, ch.current_realm_id
      from game.characters ch
      where ch.player_id = ${playerId}
      for update
    `;
    const [target] = await tx`select id, min_level from game.realms where id = ${realmId} and enabled = true`;
    if (!character || !target) throw new Error('REALM_NOT_FOUND');
    if (Number(character.level) < Number(target.min_level)) throw new Error('REALM_LOCKED');

    if (character.current_realm_id !== target.id) {
      await tx`update game.characters set current_realm_id = ${target.id}, updated_at = now() where id = ${character.id}`;
      await tx`
        insert into game.realm_travel_log (character_id, from_realm_id, to_realm_id)
        values (${character.id}, ${character.current_realm_id}, ${target.id})
      `;
    }

    const response = { realmId: target.id, travelled: character.current_realm_id !== target.id };
    await tx`
      update game.action_receipts set response = ${tx.json(response)}
      where id = ${inserted[0].id}
    `;
    return { duplicate: false, response };
  }).catch((error: Error) => ({ error: error.message }));

  if ('error' in outcome) {
    const status = outcome.error === 'REALM_LOCKED' ? 403 : 404;
    return c.json({ error: outcome.error }, status);
  }

  return c.json({ ...outcome.response, duplicate: outcome.duplicate, snapshot: await buildSnapshot(playerId) });
});

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`Nexus Realms API listening on :${info.port}`);
});
