# Nexus Realms reference audit

The authorized reference project is used as a functional baseline only. Original proprietary art/text is not copied into this repository.

Observed reference systems include character profiles/stats, resources, item definitions and instances, equipment, skills, enemies, quests, crafting, achievements, combat history, guilds, zones, professions, codex, bounties, expeditions, world events, guild raids, Earn pools/tasks/claims, premium shop, Battle Pass, referrals, arena, sets, specializations, Bastion buildings/stockpile/buffs, guild research/wars, pets, friends/chat, titles, weekly events, rankings, notifications and idempotency/action receipts.

## Nexus Realms + 1 rules

- Main navigation -> immersive mobile HUD + Telegram-native launch/deep links.
- Combat -> server-authoritative state + animated arena, skills, status effects and quality tiers.
- Inventory -> categorized inventory, comparison, sets, sockets and server validation.
- Realms -> visual world map; travel mutates realm only and has regression tests for cross-realm persistence.
- Bastion -> visual tappable base with server timers, capped production and level-dependent appearance.
- Guilds -> clan base, research, raids, wars, audit trail and shared objectives.
- Earn -> internal-only persistent reward ledger; no withdrawal promise.
- Battle Pass/referrals/rewards -> configuration-driven backend plus idempotent claims.

## Known reference weakness to eliminate

Client-heavy UI state and realm/session transitions must never be able to make clan, Earn, Battle Pass, referrals or inventory appear lost. The new architecture stores these domains independently and reloads them from the API after every session/realm transition.
