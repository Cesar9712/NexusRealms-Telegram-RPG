# Architecture

Nexus Realms: Telegram Legends is a server-authoritative Telegram RPG.

## Services

- `apps/bot`: grammY Telegram bot, deep links, optional notifications and Mini App launcher.
- `apps/miniapp`: Next.js mobile-first game client. It renders state but never owns authoritative currencies, combat, loot or timers.
- `apps/api`: Hono/Node API. Validates Telegram initData, issues sessions, executes atomic game actions and enforces idempotency.
- `apps/worker`: timer finalization, ranking refresh and low-noise Telegram notifications.
- PostgreSQL schema `game`: source of truth for all persistent gameplay.

## Trust boundaries

Telegram initData is HMAC-validated by the API. Browser timestamps, damage values, rewards and balances are untrusted. Sensitive writes use transactions plus `action_receipts` idempotency keys.

## Realm invariant

Travelling only changes `characters.current_realm_id`. Clan, Earn, Battle Pass, referrals, inventory, resources, quests and achievements live independently and must survive travel and re-login.

## Reference policy

Nexus/DungeonRealm is a read-only functional reference. New code, names, art keys and content are original.