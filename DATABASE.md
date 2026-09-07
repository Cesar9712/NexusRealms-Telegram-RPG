# Database

Migrations run in numeric order from `database/001_core.sql` through later files.

Core domains: players, characters, stats, resources, inventory/equipment, realms, combat, skills, enemies/bosses, quests, professions/crafting, Bastion, clans/raids/wars, events, Battle Pass, referrals, internal Earn, PvP, market, pets/mounts, achievements/titles/Codex, rankings, notifications, runtime config, feature flags and admin audit.

All important balances are constrained non-negative. Player-facing multi-write actions are atomic. Server-clock timestamps control recovery, crafting and construction. `action_receipts` prevents duplicate sensitive actions.

Never use localStorage as source of truth. Never delete domain rows during realm travel.