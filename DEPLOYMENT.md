# Deployment

Target topology: PostgreSQL + API web service + Telegram bot service + Mini App web service + worker.

Required secrets: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `SESSION_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_IDS`. Public client config may expose only `NEXT_PUBLIC_API_URL`.

Run migrations 001..006 before starting services. API health: `/health`. CI must be green before production promotion. Web3 and real-money withdrawals remain disabled until separate infrastructure, review and explicit authorization exist.

Render deployment is intentionally isolated from the existing Crypto Factory/Nexus reference services.