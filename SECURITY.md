# Security

- Validate Telegram Mini App initData with HMAC and max auth age.
- Signed short-lived API sessions; banned users are rejected on every authenticated request.
- Never expose bot tokens, database credentials, session secrets or service-role keys to the browser.
- Server authority for damage, loot, XP, balances, cooldowns and timers.
- Transactions for crafting, market, clan contributions, purchases and rewards.
- Idempotency keys for duplicate-tap/retry protection.
- Bot rate limiting and webhook secret.
- Admin RBAC is restricted by `ADMIN_IDS`; all administrative writes are audited.
- Web3/withdrawals cannot be enabled through the current admin endpoint.

Before production: rotate any credential ever pasted into a public place and make the GitHub repository private if proprietary code/content should remain closed.