# Mini App: two-session cookie isolation manual QA

Scope: validate the implicit-cookie concurrent GET fix in PR #29 with **two real, separate browser profiles**. Automated tests simulate cookie changes and cannot prove browser behavior. This procedure does not require production access or any payment.

## Preconditions

- Use a disposable/staging environment with the candidate branch deployed only after authorization; never change `main` for this test.
- Use two separate browser profiles (A and B), each with its own test account and distinct, non-sensitive visible state (e.g. different test realm names).
- Open developer tools Network in both profiles; preserve logs. Do **not** export or publish cookies, authorization headers, Telegram initData, or HAR files containing secrets.
- Verify that the API response for the chosen authenticated GET endpoint contains account-specific data. Do not use a public/shared endpoint as proof of isolation.

## Procedure and expected results

1. In profile A, sign in as account A; in profile B, sign in as account B. Confirm both show their own test realm/state after a fresh reload.
2. In each profile, disable browser cache in Network and trigger two overlapping requests to the same authenticated GET endpoint (for example by navigating rapidly between two views). Repeat with throttling set to Slow 3G to increase overlap.
3. Confirm every response rendered in A belongs to A and every response rendered in B belongs to B. No cross-account names, inventory, resources, or cached state may appear, even briefly.
4. In A, sign out and sign in as B (or switch the test identity using the supported login flow). While requests from the old session are still pending, trigger a fresh GET and confirm the new view does not render data from A. Repeat in the reverse direction.
5. Reload both profiles, repeat the GET, and confirm completed-response caching does not reintroduce cross-session state. Verify requests with `Vary: Cookie` are not reused from the completed-response cache.
6. Confirm ordinary mutations still complete once per action and no duplicate rewards/resources are produced by rapid double-taps. This is a regression check, not a reason to change the economy.
7. Repeat after browser restart. Note the browser, version, platform, tested commit, environment, UTC time, endpoint path (without query secrets), and pass/fail for each step.

## Stop conditions and evidence

- **Fail immediately** on any cross-account state, unauthorized success, duplicate reward, or session transition that renders the old identity's private data. Do not deploy or merge.
- Record sanitized screenshots and request/response status codes only. Never include tokens, cookies, personal data, wallet addresses, or full authenticated payloads in an issue or PR.
- Mark the manual validation **not run** until two real browser profiles have been exercised. Passing simulated-cookie unit tests is not equivalent to passing this checklist.
- Rollback: close the stacked QA PR without merging; it adds only this document.
