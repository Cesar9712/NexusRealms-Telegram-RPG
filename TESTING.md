# Testing

GitHub Actions starts PostgreSQL 17, applies every migration, runs DB regressions, TypeScript typecheck, API unit tests, all builds and a critical dependency audit.

Critical regressions include realm persistence and double-tap/idempotency. Content minimum tests prevent accidental loss of launch content. Combat engine tests cover deterministic damage/cooldown behavior. Telegram auth tests cover signature tampering and stale auth data.

Add a regression test with every bug involving lost state, duplicated rewards, timers or economy.

## Mini App GET cache: manual isolation checklist (not yet executed)

This checklist complements `apps/miniapp/src/lib/clientData.test.mjs`. Passing CI is **not** evidence that browser-managed cookies are isolated in production. Do not mark these checks as passed until they are actually performed against an authorized staging environment.

1. Open two independent browser profiles with different authenticated accounts. Capture request URLs, method, explicit Authorization headers, credentials mode, response `Vary` and `Cache-Control` headers; do not capture or publish secret cookie/token values.
2. For a GET endpoint returning `Vary: Cookie`, change the cookie/session in the same browser profile and repeat the request within 45 seconds. Verify the second response is fetched again and contains only the current account's data.
3. **Concurrency gap to investigate:** with two overlapping GET calls to the same URL and identical explicit headers, simulate a change of browser-managed cookie between dispatches while the first response remains pending. Verify whether both calls receive independent account-specific responses. The current in-flight `pending` key uses only explicit headers and URL, so `Vary: Cookie` cannot prevent sharing *before* response headers arrive. Treat this as an unverified risk, not a confirmed leak.
4. Repeat with `credentials: 'include'`, `credentials: 'omit'`, `cache: 'no-store'`, and an AbortSignal. Confirm native fetch options are preserved and aborting one caller does not cancel an unrelated request.
5. Verify that ordinary public GET responses remain cacheable when allowed by server freshness directives, and that a mutation or session change invalidates previous reads.

**Release gate:** Add an automated regression that reproduces any confirmed cross-session in-flight sharing, then validate the fix with Mini App tests and full PR CI. Do not deploy, merge to `main`, or claim production isolation from this documentation alone.
