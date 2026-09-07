# Admin

Private admin API endpoints require an authenticated Telegram user whose Telegram ID is listed in `ADMIN_IDS`.

Capabilities: overview, player search, ban/unban, resource adjustments, runtime configuration, safe feature flags and audit history. Resource edits create economy ledger entries. All admin changes create `admin_audit_log` rows.

The API deliberately refuses to enable Web3 or real-money withdrawals; those require a separate reviewed integration.