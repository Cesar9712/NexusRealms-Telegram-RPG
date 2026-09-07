# Nexus Realms: Telegram Legends

A server-authoritative mobile RPG built to live inside Telegram through a Bot + Telegram Mini App architecture.

## Workspace

- `apps/bot` — Telegram commands, deep links and notifications.
- `apps/api` — authoritative game API and Telegram authentication.
- `apps/miniapp` — visual mobile-first RPG client for Telegram.
- `database` — PostgreSQL schema and migrations.
- `docs` — architecture, security, game design, testing and deployment notes.

Development is currently isolated on `bootstrap/rpg-platform` until the vertical slice passes build and regression checks.
