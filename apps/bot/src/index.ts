import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { z } from 'zod';

const env = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBAPP_URL: z.string().url(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  BOT_PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).parse(process.env);

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
const rateBuckets = new Map<number, { count: number; resetAt: number }>();

function gameKeyboard() {
  return new InlineKeyboard()
    .webApp('⚔️ ENTRAR A NEXUS REALMS', env.TELEGRAM_WEBAPP_URL)
    .row()
    .text('🎒 Perfil', 'profile')
    .text('🏰 Bastión', 'bastion')
    .row()
    .text('🏆 Ranking', 'ranking')
    .text('👥 Clan', 'clan');
}

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(userId, { count: 1, resetAt: now + 5_000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count <= 10) return next();
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Demasiadas acciones. Intenta de nuevo en unos segundos.' }).catch(() => undefined);
});

bot.command('start', async (ctx) => {
  const launchPayload = typeof ctx.match === 'string' && ctx.match.trim() ? ctx.match.trim().slice(0, 80) : null;
  const payloadNote = launchPayload ? '\n\nEnlace de campaña recibido. La atribución se validará en el servidor al abrir la Mini App.' : '';
  await ctx.reply(
    `⚔️ <b>NEXUS REALMS: TELEGRAM LEGENDS</b>\n\nUn RPG persistente dentro de Telegram. Explora reinos, combate, consigue equipo, mejora tu Bastión, participa en clanes y eventos.${payloadNote}`,
    { parse_mode: 'HTML', reply_markup: gameKeyboard() },
  );
});

bot.command('play', async (ctx) => {
  await ctx.reply('Abre el mundo de Nexus Realms:', { reply_markup: new InlineKeyboard().webApp('JUGAR', env.TELEGRAM_WEBAPP_URL) });
});

bot.command('profile', async (ctx) => {
  await ctx.reply('Tu perfil, estadísticas, equipo y progreso se cargan desde el servidor dentro del juego.', { reply_markup: gameKeyboard() });
});

bot.command('quests', async (ctx) => {
  await ctx.reply('Historia, misiones diarias, semanales, de clan y eventos están disponibles dentro de la Mini App.', { reply_markup: new InlineKeyboard().webApp('ABRIR MISIONES', env.TELEGRAM_WEBAPP_URL) });
});

bot.command('clan', async (ctx) => {
  await ctx.reply('Abre el juego para gestionar clan, contribuciones, base, raids y guerras.', { reply_markup: new InlineKeyboard().webApp('ABRIR CLAN', env.TELEGRAM_WEBAPP_URL) });
});

bot.command('rewards', async (ctx) => {
  await ctx.reply('Las recompensas se calculan y reclaman en servidor para evitar duplicaciones.', { reply_markup: new InlineKeyboard().webApp('VER RECOMPENSAS', env.TELEGRAM_WEBAPP_URL) });
});

bot.command('help', async (ctx) => {
  await ctx.reply('<b>Comandos</b>\n/start — inicio y deep links\n/play — abrir el juego\n/profile — perfil\n/quests — misiones\n/clan — clan\n/rewards — recompensas\n/help — ayuda', { parse_mode: 'HTML' });
});

bot.callbackQuery('profile', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Abriendo acceso al perfil persistente.', { reply_markup: new InlineKeyboard().webApp('PERFIL', env.TELEGRAM_WEBAPP_URL) }); });
bot.callbackQuery('bastion', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('El Bastión usa producción limitada y timers del servidor.', { reply_markup: new InlineKeyboard().webApp('BASTIÓN', env.TELEGRAM_WEBAPP_URL) }); });
bot.callbackQuery('ranking', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Rankings globales, de clan, PvP y temporada se muestran dentro del juego.', { reply_markup: new InlineKeyboard().webApp('RANKING', env.TELEGRAM_WEBAPP_URL) }); });
bot.callbackQuery('clan', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Clanes con base, raids, progresión y guerras.', { reply_markup: new InlineKeyboard().webApp('CLAN', env.TELEGRAM_WEBAPP_URL) }); });

bot.catch((error) => console.error('Telegram bot error', error.error));

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true, service: 'nexusrealms-bot', serverTime: new Date().toISOString() }));
const telegramWebhook = webhookCallback(bot, 'hono');
app.post('/telegram/webhook', async (c) => {
  if (env.TELEGRAM_WEBHOOK_SECRET && c.req.header('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Forbidden', 403);
  }
  return telegramWebhook(c);
});

async function configureBot() {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Abrir Nexus Realms' },
    { command: 'play', description: 'Jugar' },
    { command: 'profile', description: 'Ver perfil' },
    { command: 'quests', description: 'Ver misiones' },
    { command: 'clan', description: 'Abrir clan' },
    { command: 'rewards', description: 'Ver recompensas' },
    { command: 'help', description: 'Ayuda' },
  ]);
}

await configureBot();
if (env.NODE_ENV === 'development') {
  bot.start({ onStart: (info) => console.log(`Bot @${info.username} running in long-polling mode`) });
} else {
  serve({ fetch: app.fetch, port: env.BOT_PORT }, (info) => console.log(`Webhook server listening on :${info.port}`));
}
