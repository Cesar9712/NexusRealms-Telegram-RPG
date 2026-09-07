# Telegram setup

1. Create the production bot with BotFather.
2. Store `TELEGRAM_BOT_TOKEN` only in the deployment secret store.
3. Set the Mini App HTTPS URL as `TELEGRAM_WEBAPP_URL`.
4. Set the production bot username in `BOT_USERNAME`.
5. Configure the API/webhook URL and `TELEGRAM_WEBHOOK_SECRET`.
6. Commands: `/start`, `/play`, `/profile`, `/quests`, `/clan`, `/rewards`, `/help`.
7. Referral deep links use `startapp=ref_CODE` / supported start parameters; the API validates attribution and blocks self-referrals.

The Mini App sends Telegram `initData` unchanged to the API. The API validates the Telegram signature and auth age before creating a game session. Never trust parsed client user data without this validation.