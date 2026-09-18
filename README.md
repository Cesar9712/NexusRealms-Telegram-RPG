# Nexus Realms: Telegram Legends

A server-authoritative dark-fantasy/anime mobile RPG built to live inside Telegram through a Bot + Telegram Mini App architecture.

## Workspace

- `apps/bot` — Telegram commands, deep links, webhook and Mini App launcher.
- `apps/api` — authoritative game API, Telegram authentication, gameplay, social economy and admin routes.
- `apps/miniapp` — visual mobile-first RPG client plus private `/admin` route.
- `apps/worker` — server timers, rankings and optional Telegram notifications.
- `database` — PostgreSQL migrations, content seeds and critical regression tests.
- `apps/miniapp/public/assets` — structured production folders for final art/audio.

## Launch content baseline

4 classes · 9 realms · 50+ enemies · 12 bosses · 32 class skills · 50 quests · 50 recipes · 8 professions · 14 Bastion buildings · 100 achievements · Battle Pass · events · clans/raids · Arena · internal market · pets/mounts · Codex · referrals · daily rewards.

## Security model

Telegram Mini App `initData` is verified in the API. PostgreSQL is the source of truth. Damage, loot, balances, timers, crafting, travel and rewards are server-authoritative. Sensitive actions are transactional and idempotent. Web3 and real-money withdrawals are disabled by default and cannot be enabled through the current admin endpoint.

## Validation

GitHub Actions boots PostgreSQL 17, applies every migration, executes realm-persistence/double-tap/content tests, runs TypeScript typecheck, unit tests, builds all workspace apps and performs a critical dependency audit.

See `ARCHITECTURE.md`, `GAME_DESIGN.md`, `DATABASE.md`, `SECURITY.md`, `TESTING.md`, `DEPLOYMENT.md`, `TELEGRAM_SETUP.md`, `ADMIN.md`, `ECONOMY.md` and `ROADMAP.md`.

Development remains isolated on `bootstrap/rpg-platform` and PR #1 until validation is green and production credentials exist.
