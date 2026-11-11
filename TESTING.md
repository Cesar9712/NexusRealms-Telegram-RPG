# Testing

GitHub Actions starts PostgreSQL 17, applies every migration, runs DB regressions, TypeScript typecheck, API unit tests, all builds and a critical dependency audit.

Critical regressions include realm persistence and double-tap/idempotency. Content minimum tests prevent accidental loss of launch content. Combat engine tests cover deterministic damage/cooldown behavior. Telegram auth tests cover signature tampering and stale auth data.

Add a regression test with every bug involving lost state, duplicated rewards, timers or economy.

## Manual release verification (not covered by a green CI run)

Before any production promotion, verify in a non-production environment:

- Telegram Mini App sign-in succeeds with valid `initData` and rejects tampered or expired authentication data.
- A newly created character persists after reload; switching accounts never exposes the previous account's inventory or cached API responses.
- Repeated taps on a reward, purchase or combat action do not duplicate rewards or charges; inspect server state, not just UI feedback.
- The Mini App can reach the configured API origin, and the API `/health` endpoint responds after migrations 001..006 are applied.
- Bot webhook and worker behavior are checked with test credentials; production tokens and customer data are not required for this checklist.

Record the tested commit, environment, date and observed results in the PR. These are **manual checks to perform**, not claims that a deployment or smoke test has passed. Do not enable Web3 or real-money withdrawals as part of verification.
