# Architecture

Nexus Realms: Telegram Legends is a server-authoritative Telegram RPG split into four deployable surfaces:

1. `apps/bot` — Telegram commands, deep links and opt-in notifications.
2. `apps/miniapp` — mobile-first Telegram Mini App and visual gameplay client.
3. `apps/api` — authoritative game API, Telegram init-data verification, idempotent mutations and realtime gateway.
4. PostgreSQL — durable source of truth for progression, inventory, economy, timers, clans, Battle Pass, referrals and world state.

## Trust boundaries

The Mini App is untrusted. It may request actions, but never decides damage, loot, currency, cooldown completion, timer completion, quest rewards or purchases. Telegram `initData` is verified in the API before a game session is issued. Device time is display-only; server timestamps decide regeneration, crafting, building and expedition completion.

## Persistence rule

Realm travel changes only `characters.current_realm_id`. Clan membership, Earn state, Battle Pass, referrals, inventory, equipment, quests, currencies, achievements and settings are independent records keyed by player/character IDs. Realm travel never rewrites or replaces those records.

## Sensitive mutation rule

Reward claims, crafting, loot, shop purchases, referrals, daily rewards and Battle Pass claims require an idempotency key and execute inside a database transaction. A unique action receipt prevents double-tap and reconnect duplication.

## Economy rule

Premium credits are internal game currency. Web3 and real-money withdrawals are disabled by feature flags and are not part of the core economy.

## Performance

The Mini App is mobile-first, code-split by gameplay surface, uses CSS/GPU-friendly effects, reduced-motion support and quality tiers. Heavy combat particles are cosmetic and never authoritative.
