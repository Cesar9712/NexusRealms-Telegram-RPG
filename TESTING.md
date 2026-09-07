# Testing

GitHub Actions starts PostgreSQL 17, applies every migration, runs DB regressions, TypeScript typecheck, API unit tests, all builds and a critical dependency audit.

Critical regressions include realm persistence and double-tap/idempotency. Content minimum tests prevent accidental loss of launch content. Combat engine tests cover deterministic damage/cooldown behavior. Telegram auth tests cover signature tampering and stale auth data.

Add a regression test with every bug involving lost state, duplicated rewards, timers or economy.