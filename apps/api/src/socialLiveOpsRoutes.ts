import type { Hono } from 'hono';
import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;
type RequirePlayerId = (authorization?: string) => Promise<string>;
const n = (value: unknown) => Number(value ?? 0);

function requiredKey(value?: string) {
  if (!value || value.length > 120) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  return value;
}

async function receipt(tx: any, playerId: string, operation: string, key: string) {
  const rows = await tx`
    insert into game.action_receipts(player_id,operation,idempotency_key)
    values(${playerId},${operation},${key})
    on conflict(player_id,operation,idempotency_key) do nothing
    returning id
  `;
  if (rows[0]) return { id: rows[0].id, duplicate: false, response: null };
  const [old] = await tx`
    select response from game.action_receipts
    where player_id=${playerId} and operation=${operation} and idempotency_key=${key}
  `;
  return { id: null, duplicate: true, response: old?.response ?? {} };
}

async function addResource(tx: any, characterId: string, code: string, amount: number) {
  const quantity = Math.floor(Math.max(0, amount));
  if (!quantity) return;
  await tx`
    insert into game.resources(character_id,resource_code,amount)
    values(${characterId},${code},${quantity})
    on conflict(character_id,resource_code) do update
      set amount=game.resources.amount+excluded.amount,updated_at=now()
  `;
}

async function grant(tx: any, characterId: string, reward: any) {
  const value = reward && typeof reward === 'object' ? reward : {};
  await addResource(tx, characterId, 'gold', n(value.gold));
  await addResource(tx, characterId, 'crystals', n(value.crystals));
  await addResource(tx, characterId, 'clan_coins', n(value.clan_coins));
  if (value.resources && typeof value.resources === 'object') {
    for (const [code, amount] of Object.entries(value.resources)) {
      await addResource(tx, characterId, code, n(amount));
    }
  }
  if (n(value.xp) > 0) {
    await tx`
      update game.characters
      set experience=experience+${Math.floor(n(value.xp))},updated_at=now()
      where id=${characterId}
    `;
  }
}

function weeklyCycle() {
  const date = new Date();
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

export function registerSocialLiveOpsRoutes(app: Hono, sql: Sql, requirePlayerId: RequirePlayerId) {
  app.get('/v1/clan/live', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }

    const [member] = await sql`
      select m.*,c.name,c.tag,c.level
      from game.clan_members m join game.clans c on c.id=m.clan_id
      where m.player_id=${playerId}
    `;
    if (!member) return c.json({ clan: null });

    const cycle = weeklyCycle();
    await sql`
      insert into game.clan_projects(clan_id,project_id,cycle_key)
      select ${member.clan_id},id,${cycle} from game.clan_project_definitions where enabled
      on conflict do nothing
    `;
    await sql`
      insert into game.clan_mission_progress(clan_id,mission_id,cycle_key)
      select ${member.clan_id},id,${cycle} from game.clan_mission_definitions where enabled
      on conflict do nothing
    `;

    const [projects, missions, shop, wars] = await Promise.all([
      sql`select p.*,d.name_es,d.name_en,d.description_es,d.description_en,d.target,d.resource_code,d.rewards from game.clan_projects p join game.clan_project_definitions d on d.id=p.project_id where p.clan_id=${member.clan_id} and p.cycle_key=${cycle} order by d.id`,
      sql`select p.*,d.name_es,d.name_en,d.metric,d.target,d.rewards from game.clan_mission_progress p join game.clan_mission_definitions d on d.id=p.mission_id where p.clan_id=${member.clan_id} and p.cycle_key=${cycle} order by d.id`,
      sql`select * from game.clan_shop_items where enabled and min_clan_level<=${member.level} order by price_clan_coins`,
      sql`select w.*,a.name clan_a_name,a.tag clan_a_tag,b.name clan_b_name,b.tag clan_b_tag from game.clan_wars w join game.clans a on a.id=w.clan_a join game.clans b on b.id=w.clan_b where w.clan_a=${member.clan_id} or w.clan_b=${member.clan_id} order by w.starts_at desc limit 12`,
    ]);

    return c.json({ clan: member, cycle, projects, missions, shop, wars, serverTime: new Date().toISOString() });
  });

  app.post('/v1/clan/projects/:projectId/contribute', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const projectId = c.req.param('projectId');
    const body = await c.req.json().catch(() => ({}));
    const requestedAmount = Math.max(1, Math.min(5000, Math.floor(n(body.amount))));
    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'clan.project.contribute', key);
      if (r.duplicate) return { duplicate: true, response: r.response };

      const [member] = await tx`
        select m.clan_id,ch.id character_id
        from game.clan_members m join game.characters ch on ch.player_id=m.player_id
        where m.player_id=${playerId}
      `;
      const [definition] = await tx`select * from game.clan_project_definitions where id=${projectId} and enabled`;
      if (!member || !definition) throw new Error('PROJECT_NOT_FOUND');

      const cycle = weeklyCycle();
      await tx`insert into game.clan_projects(clan_id,project_id,cycle_key) values(${member.clan_id},${projectId},${cycle}) on conflict do nothing`;
      const [project] = await tx`select * from game.clan_projects where clan_id=${member.clan_id} and project_id=${projectId} and cycle_key=${cycle} for update`;
      if (project.completed_at) throw new Error('PROJECT_COMPLETE');

      const contribution = Math.min(requestedAmount, n(definition.target) - n(project.progress));
      if (contribution <= 0) throw new Error('PROJECT_COMPLETE');
      const [resource] = await tx`select amount from game.resources where character_id=${member.character_id} and resource_code=${definition.resource_code} for update`;
      if (n(resource?.amount) < contribution) throw new Error('INSUFFICIENT_RESOURCE');

      await tx`update game.resources set amount=amount-${contribution},updated_at=now() where character_id=${member.character_id} and resource_code=${definition.resource_code}`;
      const progress = n(project.progress) + contribution;
      const complete = progress >= n(definition.target);
      await tx`update game.clan_projects set progress=${progress},completed_at=case when ${complete} then now() else null end,updated_at=now() where clan_id=${member.clan_id} and project_id=${projectId} and cycle_key=${cycle}`;
      await tx`update game.clan_members set contribution=contribution+${contribution} where clan_id=${member.clan_id} and player_id=${playerId}`;
      await tx`select game.progress_live_activity(${playerId},'clan_contribution',${contribution})`;

      if (complete) {
        const clanXp = n(definition.rewards?.clan_xp);
        const clanCoins = n(definition.rewards?.clan_coins);
        await tx`update game.clans set experience=experience+${clanXp} where id=${member.clan_id}`;
        if (clanCoins > 0) {
          await tx`insert into game.clan_treasury(clan_id,resource_code,amount) values(${member.clan_id},'clan_coins',${clanCoins}) on conflict(clan_id,resource_code) do update set amount=game.clan_treasury.amount+excluded.amount,updated_at=now()`;
        }
        await tx`update game.clan_projects set claimed_at=now() where clan_id=${member.clan_id} and project_id=${projectId} and cycle_key=${cycle}`;
      }

      const response = { projectId, contributed: contribution, progress, target: n(definition.target), complete };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result);
  });

  app.post('/v1/clan/missions/:missionId/claim', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const missionId = c.req.param('missionId');
    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'clan.mission.claim', key);
      if (r.duplicate) return { duplicate: true, response: r.response };
      const [member] = await tx`select * from game.clan_members where player_id=${playerId}`;
      if (!member || !['leader', 'officer'].includes(String(member.role))) throw new Error('CLAN_OFFICER_REQUIRED');
      const cycle = weeklyCycle();
      const [row] = await tx`
        select p.*,d.target,d.rewards
        from game.clan_mission_progress p join game.clan_mission_definitions d on d.id=p.mission_id
        where p.clan_id=${member.clan_id} and p.mission_id=${missionId} and p.cycle_key=${cycle}
        for update
      `;
      if (!row || !row.completed_at || row.claimed_at) throw new Error('MISSION_REWARD_UNAVAILABLE');

      const clanXp = n(row.rewards?.clan_xp);
      const clanCoins = n(row.rewards?.clan_coins);
      await tx`update game.clans set experience=experience+${clanXp} where id=${member.clan_id}`;
      if (clanCoins > 0) {
        await tx`insert into game.clan_treasury(clan_id,resource_code,amount) values(${member.clan_id},'clan_coins',${clanCoins}) on conflict(clan_id,resource_code) do update set amount=game.clan_treasury.amount+excluded.amount,updated_at=now()`;
      }
      await tx`update game.clan_mission_progress set claimed_at=now() where clan_id=${member.clan_id} and mission_id=${missionId} and cycle_key=${cycle}`;
      const response = { claimed: true, reward: row.rewards };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result);
  });

  app.post('/v1/clan/shop/:itemId/buy', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const itemId = c.req.param('itemId');
    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'clan.shop.buy', key);
      if (r.duplicate) return { duplicate: true, response: r.response };
      const [member] = await tx`
        select m.clan_id,c.level,ch.id character_id
        from game.clan_members m join game.clans c on c.id=m.clan_id join game.characters ch on ch.player_id=m.player_id
        where m.player_id=${playerId}
      `;
      const [item] = await tx`select * from game.clan_shop_items where id=${itemId} and enabled`;
      if (!member || !item || n(member.level) < n(item.min_clan_level)) throw new Error('SHOP_ITEM_LOCKED');
      const [coins] = await tx`select amount from game.resources where character_id=${member.character_id} and resource_code='clan_coins' for update`;
      if (n(coins?.amount) < n(item.price_clan_coins)) throw new Error('INSUFFICIENT_CLAN_COINS');

      await tx`update game.resources set amount=amount-${n(item.price_clan_coins)},updated_at=now() where character_id=${member.character_id} and resource_code='clan_coins'`;
      await tx`insert into game.clan_shop_purchases(clan_id,player_id,shop_item_id,price,idempotency_key) values(${member.clan_id},${playerId},${itemId},${n(item.price_clan_coins)},${key})`;
      await grant(tx, member.character_id, item.contents);
      const response = { purchased: true, itemId, contents: item.contents };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result);
  });

  app.post('/v1/clan/wars/match', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'clan.war.match', key);
      if (r.duplicate) return { duplicate: true, response: r.response };
      const [member] = await tx`select m.*,c.level,c.experience from game.clan_members m join game.clans c on c.id=m.clan_id where m.player_id=${playerId}`;
      if (!member || !['leader', 'officer'].includes(String(member.role))) throw new Error('CLAN_OFFICER_REQUIRED');
      const [open] = await tx`select id from game.clan_wars where status in ('scheduled','active') and ends_at>now() and (clan_a=${member.clan_id} or clan_b=${member.clan_id})`;
      if (open) throw new Error('CLAN_WAR_ALREADY_OPEN');
      const [opponent] = await tx`
        select id,level,experience from game.clans
        where id<>${member.clan_id}
          and not exists(select 1 from game.clan_wars w where w.status in ('scheduled','active') and w.ends_at>now() and (w.clan_a=game.clans.id or w.clan_b=game.clans.id))
        order by abs(level-${member.level}),abs(experience-${member.experience}) limit 1
      `;
      if (!opponent) throw new Error('NO_CLAN_OPPONENT');
      const [war] = await tx`
        insert into game.clan_wars(season_id,clan_a,clan_b,starts_at,ends_at,status)
        values('live',${member.clan_id},${opponent.id},now(),now()+interval '12 hours','active') returning *
      `;
      const response = { war };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result, 201);
  });

  app.post('/v1/clan/wars/:warId/attack', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const warId = c.req.param('warId');
    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'clan.war.attack', key);
      if (r.duplicate) return { duplicate: true, response: r.response };
      const [member] = await tx`select m.clan_id,ch.power from game.clan_members m join game.characters ch on ch.player_id=m.player_id where m.player_id=${playerId}`;
      const [war] = await tx`select * from game.clan_wars where id=${warId} for update`;
      if (!member || !war || ![String(war.clan_a), String(war.clan_b)].includes(String(member.clan_id))) throw new Error('WAR_NOT_FOUND');
      if (war.status !== 'active' || new Date(war.ends_at).getTime() <= Date.now()) throw new Error('WAR_CLOSED');
      const [used] = await tx`select count(*)::int total from game.clan_war_attacks where war_id=${warId} and player_id=${playerId}`;
      const attackNo = n(used?.total) + 1;
      if (attackNo > 3) throw new Error('NO_WAR_ATTEMPTS');

      const score = Math.max(10, Math.round(Math.sqrt(Math.max(1, n(member.power))) * 8 * (0.85 + Math.random() * 0.3)));
      await tx`insert into game.clan_war_attacks(war_id,player_id,attack_no,score) values(${warId},${playerId},${attackNo},${score})`;
      if (String(member.clan_id) === String(war.clan_a)) await tx`update game.clan_wars set score_a=score_a+${score} where id=${warId}`;
      else await tx`update game.clan_wars set score_b=score_b+${score} where id=${warId}`;
      await tx`select game.progress_live_activity(${playerId},'clan_war_attack',1)`;
      const response = { score, attemptsRemaining: 3 - attackNo };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result);
  });

  app.get('/v1/events/live', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }

    const events = await sql`
      select i.id instance_id,i.event_id,i.starts_at,i.ends_at,i.status,d.event_type,d.name_es,d.name_en,d.description_es,d.description_en,d.config,d.rewards,coalesce(ec.contribution,0)::bigint contribution
      from game.event_instances i join game.event_definitions d on d.id=i.event_id
      left join game.event_contributions ec on ec.event_instance_id=i.id and ec.player_id=${playerId}
      where i.status in ('active','scheduled') and i.ends_at>now()
      order by i.starts_at
    `;
    const tiers = await sql`
      select t.*,i.id instance_id,exists(select 1 from game.event_reward_claims c where c.event_instance_id=i.id and c.player_id=${playerId} and c.tier=t.tier) claimed
      from game.event_instances i join game.event_personal_tier_definitions t on t.event_id=i.event_id
      where i.status='active' and i.ends_at>now()
      order by i.id,t.tier
    `;
    return c.json({ events, tiers, serverTime: new Date().toISOString() });
  });

  app.post('/v1/events/:instanceId/tiers/:tier/claim', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const instanceId = c.req.param('instanceId');
    const tier = Math.floor(n(c.req.param('tier')));
    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'event.tier.claim', key);
      if (r.duplicate) return { duplicate: true, response: r.response };
      const [row] = await tx`
        select i.id,i.event_id,t.target,t.reward,coalesce(ec.contribution,0) contribution
        from game.event_instances i
        join game.event_personal_tier_definitions t on t.event_id=i.event_id and t.tier=${tier}
        left join game.event_contributions ec on ec.event_instance_id=i.id and ec.player_id=${playerId}
        where i.id=${instanceId} and i.status='active' and now() between i.starts_at and i.ends_at
        for update of i
      `;
      if (!row || n(row.contribution) < n(row.target)) throw new Error('EVENT_TIER_LOCKED');
      const inserted = await tx`insert into game.event_reward_claims(event_instance_id,player_id,tier,reward) values(${instanceId},${playerId},${tier},${tx.json(row.reward)}) on conflict do nothing returning tier`;
      if (!inserted[0]) throw new Error('ALREADY_CLAIMED');
      const [character] = await tx`select id from game.characters where player_id=${playerId} for update`;
      if (!character) throw new Error('CHARACTER_REQUIRED');
      await grant(tx, character.id, row.reward);
      await tx`select game.progress_achievement_metric(${character.id},'event_score',1)`;
      const response = { claimed: true, reward: row.reward };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result);
  });

  app.get('/v1/battle-pass/missions', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    const [season] = await sql`select id from game.battle_pass_seasons where now() between starts_at and ends_at order by starts_at desc limit 1`;
    if (!season) return c.json({ season: null, missions: [] });
    const missions = await sql`
      select d.*,game.live_cycle_key(d.period) cycle_key,coalesce(mp.progress,0)::int progress,mp.completed_at,mp.rewarded_at
      from game.battle_pass_mission_definitions d
      left join game.battle_pass_mission_progress mp on mp.mission_id=d.id and mp.player_id=${playerId} and mp.season_id=${season.id} and mp.cycle_key=game.live_cycle_key(d.period)
      where d.enabled
      order by case d.period when 'daily' then 0 when 'weekly' then 1 else 2 end,d.id
    `;
    return c.json({ season: season.id, missions });
  });

  app.get('/v1/referrals/milestones', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    const [qualified] = await sql`
      select count(*)::int total
      from game.referral_attributions a join game.characters ch on ch.player_id=a.referred_player_id
      where a.referrer_player_id=${playerId} and ch.level>=3
    `;
    const claims = await sql`select milestone,reward,claimed_at from game.referral_reward_claims where referrer_player_id=${playerId} order by milestone`;
    const rewards = [
      { milestone: 1, reward: { earn: 50, gold: 150 } },
      { milestone: 3, reward: { earn: 120, gold: 350, resources: { cosmetic_tokens: 1 } } },
      { milestone: 5, reward: { earn: 220, gold: 600, resources: { cosmetic_tokens: 2 } } },
      { milestone: 10, reward: { earn: 500, gold: 1200, resources: { referral_badge: 1 } } },
      { milestone: 20, reward: { earn: 1000, gold: 2500, resources: { cosmetic_tokens: 5 } } },
      { milestone: 50, reward: { earn: 3000, gold: 6000, resources: { referral_legend: 1 } } },
    ];
    return c.json({
      qualified: qualified?.total ?? 0,
      rewards: rewards.map(value => ({ ...value, claimed: claims.some((claim: any) => n(claim.milestone) === value.milestone) })),
    });
  });

  app.post('/v1/referrals/milestones/:milestone/claim', async c => {
    let playerId: string;
    try { playerId = await requirePlayerId(c.req.header('authorization')); }
    catch { return c.json({ error: 'UNAUTHORIZED' }, 401); }
    let key: string;
    try { key = requiredKey(c.req.header('idempotency-key')); }
    catch { return c.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400); }

    const milestone = Math.floor(n(c.req.param('milestone')));
    const definitions: Record<number, any> = {
      1: { earn: 50, gold: 150 },
      3: { earn: 120, gold: 350, resources: { cosmetic_tokens: 1 } },
      5: { earn: 220, gold: 600, resources: { cosmetic_tokens: 2 } },
      10: { earn: 500, gold: 1200, resources: { referral_badge: 1 } },
      20: { earn: 1000, gold: 2500, resources: { cosmetic_tokens: 5 } },
      50: { earn: 3000, gold: 6000, resources: { referral_legend: 1 } },
    };
    const reward = definitions[milestone];
    if (!reward) return c.json({ error: 'INVALID_MILESTONE' }, 400);

    const result = await sql.begin(async tx => {
      const r = await receipt(tx, playerId, 'referral.milestone.claim', key);
      if (r.duplicate) return { duplicate: true, response: r.response };
      const [qualified] = await tx`
        select count(*)::int total
        from game.referral_attributions a join game.characters ch on ch.player_id=a.referred_player_id
        where a.referrer_player_id=${playerId} and ch.level>=3
      `;
      if (n(qualified?.total) < milestone) throw new Error('REFERRAL_MILESTONE_LOCKED');
      const inserted = await tx`
        insert into game.referral_reward_claims(referrer_player_id,milestone,qualified_referrals,reward)
        values(${playerId},${milestone},${n(qualified?.total)},${tx.json(reward)})
        on conflict do nothing returning milestone
      `;
      if (!inserted[0]) throw new Error('ALREADY_CLAIMED');
      const [character] = await tx`select id from game.characters where player_id=${playerId} for update`;
      if (!character) throw new Error('CHARACTER_REQUIRED');
      await grant(tx, character.id, reward);
      if (n(reward.earn) > 0) {
        await tx`insert into game.earn_balances(player_id,internal_credits) values(${playerId},${n(reward.earn)}) on conflict(player_id) do update set internal_credits=game.earn_balances.internal_credits+excluded.internal_credits,updated_at=now()`;
        await tx`insert into game.earn_events(player_id,source,amount,metadata) values(${playerId},'referral_milestone',${n(reward.earn)},${tx.json({ milestone })})`;
      }
      const response = { claimed: true, reward };
      await tx`update game.action_receipts set response=${tx.json(response)} where id=${r.id}`;
      return { duplicate: false, response };
    }).catch((error: Error) => ({ error: error.message }));

    if ('error' in result) return c.json({ error: result.error }, 409);
    return c.json(result);
  });
}
