import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { z } from 'zod';

const env = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBAPP_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).parse(process.env);

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('⚔️ ENTRAR A NEXUS REALMS', env.TELEGRAM_WEBAPP_URL)
    .row()
    .text('🎒 Perfil', 'profile')
    .text('🏰 Bastión', 'bastion')
    .row()
    .text('🏆 Ranking', 'ranking')
    .text('👥 Clan', 'clan');

  await ctx.reply(
    '⚔️ <b>NEXUS REALMS</b>\n\nUn RPG persistente dentro de Telegram. Explora, combate, consigue equipo, mejora tu bastión, únete a clanes y participa en eventos.\n\nAbre el juego para comenzar tu aventura.',
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
});

bot.callbackQuery('profile', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('🎒 Tu perfil RPG estará conectado al estado persistente del servidor.');
});

bot.callbackQuery('bastion', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('🏰 Bastión: mejoras, edificios, producción limitada y temporizadores controlados por servidor.');
});

bot.callbackQuery('ranking', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('🏆 El ranking global se activará con la base de datos persistente.');
});

bot.callbackQuery('clan', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('👥 Clanes: miembros, progresión, contribuciones, guerras y recompensas.');
});

bot.catch((error) => {
  console.error('Telegram bot error', error.error);
});

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true, service: 'nexusrealms-bot' }));
app.post('/telegram/webhook', webhookCallback(bot, 'hono'));

if (env.NODE_ENV === 'development') {
  bot.start({
    onStart: (info) => console.log(`Bot @${info.username} running in long-polling mode`),
  });
} else {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`Webhook server listening on :${info.port}`);
  });
}
