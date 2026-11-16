# Implicit-cookie GET cache release gate

Status: **blocked** until the regression in `apps/miniapp/src/lib/clientData.test.mjs` passes.

## Reproduction

The test `completed implicit-cookie GET responses must not cross invisible HttpOnly session changes` issues two sequential GETs to the same URL. It changes a simulated browser-managed cookie from account A to account B between requests, without changing `nr_session`, Authorization, response Set-Cookie, or Vary. A cache keyed only on URL and JavaScript-visible headers returns A's response to B. This is a simulated regression, **not** evidence of an observed production data leak.

## Required mitigation

* Do not reuse completed GET payloads for requests that may carry implicit browser cookies when the request identity is not explicitly verifiable. A response's `Cache-Control: public` alone does not prove that the endpoint's body is independent of cookies.
* Preserve explicit bearer-identity cache separation and invalidation on login, logout, mutations and account switches. Do not weaken abort, explicit credentials/cache-mode, Vary: Cookie, Set-Cookie or TTL protections.
* Consider a separately reviewed allowlist for truly public, cookie-independent endpoints only after server-side verification. Do not infer public safety from endpoint names.

## Acceptance evidence

1. Run the targeted Node test suite including the sequential invisible-cookie rotation regression and all existing cache/TTL tests; record exact pass/fail counts.
2. Run repository typecheck, build, PostgreSQL migration/idempotency and dependency audit CI checks.
3. In a nonproduction browser, use two separate profiles and two test identities. Verify that A's private GET body is never served to B after cookie rotation, including sequential and concurrent GETs, and repeat after logout.
4. Confirm that no real account identifiers, cookies, tokens, payment data or screenshots containing secrets are included in PR logs.
5. Keep this PR in draft and do not merge or deploy while any gate fails.

## Rollback

Close the draft PR or revert its isolated commits; do not change `main`. No production state, wallets, prices or deployment settings are involved.
