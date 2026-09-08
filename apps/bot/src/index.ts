import 'dotenv/config';
import { createHash } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { z } from 'zod';

const env=z.object({TELEGRAM_BOT_TOKEN:z.string().min(20),TELEGRAM_WEBAPP_URL:z.string().url(),BOT_PUBLIC_URL:z.string().url().optional(),BOT_PORT:z.coerce.number().int().positive().default(3000),PORT:z.coerce.number().int().positive().optional(),NODE_ENV:z.enum(['development','test','production']).default('development')}).parse(process.env);
const cacheVersion=Date.now().toString(36);
function gameUrlFor(open?:string){const url=new URL(env.TELEGRAM_WEBAPP_URL);url.searchParams.set('v',cacheVersion);if(open)url.searchParams.set('open',open);return url.toString();}
const gameUrl=gameUrlFor();
const webhookSecret=createHash('sha256').update(`nexus-realms-webhook:${env.TELEGRAM_BOT_TOKEN}`).digest('hex');
const bot=new Bot(env.TELEGRAM_BOT_TOKEN);const rateBuckets=new Map<number,{count:number;resetAt:number}>();
function gameKeyboard(){return new InlineKeyboard().webApp('ENTRAR A NEXUS REALMS',gameUrl).row().text('Perfil','profile').text('Bastión','bastion').row().text('Ranking','ranking').text('Clan','clan');}
bot.use(async(ctx,next)=>{const userId=ctx.from?.id;if(!userId)return next();const now=Date.now(),bucket=rateBuckets.get(userId);if(!bucket||bucket.resetAt<=now){rateBuckets.set(userId,{count:1,resetAt:now+5000});return next();}bucket.count+=1;if(bucket.count<=10)return next();if(ctx.callbackQuery)await ctx.answerCallbackQuery({text:'Demasiadas acciones. Intenta de nuevo en unos segundos.'}).catch(()=>undefined);});

bot.command('start',async ctx=>{const launchPayload=typeof ctx.match==='string'&&ctx.match.trim()?ctx.match.trim().slice(0,80):null;const note=launchPayload?'\n\nEnlace de invitación detectado. La atribución se valida al abrir el juego.':'';await ctx.reply(`<b>NEXUS REALMS: TELEGRAM LEGENDS</b>\n\nRPG persistente dentro de Telegram. Explora reinos, combate, consigue equipo, mejora tu Bastión, participa en clanes, temporadas y eventos.${note}`,{parse_mode:'HTML',reply_markup:gameKeyboard()});});
bot.command('play',async ctx=>ctx.reply('Abre Nexus Realms:',{reply_markup:new InlineKeyboard().webApp('JUGAR',gameUrl)}));
bot.command('profile',async ctx=>ctx.reply('Atributos, tácticas, habilidades y progresión.',{reply_markup:new InlineKeyboard().webApp('ABRIR PERFIL',gameUrlFor('progression'))}));
bot.command('quests',async ctx=>ctx.reply('Historia, misiones diarias, semanales y objetivos de progresión.',{reply_markup:new InlineKeyboard().webApp('ABRIR MISIONES',gameUrlFor('quests'))}));
bot.command('clan',async ctx=>ctx.reply('Proyectos, misiones, tienda, raids y guerras de clan.',{reply_markup:new InlineKeyboard().webApp('ABRIR CLAN',gameUrlFor('clan'))}));
bot.command('rewards',async ctx=>ctx.reply('Recompensas diarias y de temporada se reclaman con autoridad del servidor.',{reply_markup:new InlineKeyboard().webApp('RECOMPENSA DIARIA',gameUrlFor('daily')).row().webApp('PASE DE BATALLA',gameUrlFor('battlepass'))}));
bot.command('bastion',async ctx=>ctx.reply('Edificios, producción y timers de tu Bastión.',{reply_markup:new InlineKeyboard().webApp('ABRIR BASTIÓN',gameUrlFor('bastion'))}));
bot.command('events',async ctx=>ctx.reply('Consulta eventos activos y tus hitos personales.',{reply_markup:new InlineKeyboard().webApp('ABRIR EVENTOS',gameUrlFor('events'))}));
bot.command('battlepass',async ctx=>ctx.reply('Misiones de temporada y rutas Gratis/Premium.',{reply_markup:new InlineKeyboard().webApp('ABRIR PASE',gameUrlFor('battlepass'))}));
bot.command('arena',async ctx=>ctx.reply('PvP, liga, rating y rivales.',{reply_markup:new InlineKeyboard().webApp('ABRIR ARENA',gameUrlFor('arena'))}));
bot.command('help',async ctx=>ctx.reply('<b>Comandos</b>\n/start — inicio\n/play — jugar\n/profile — atributos\n/quests — misiones\n/clan — clan\n/rewards — recompensas\n/bastion — Bastión\n/events — eventos\n/battlepass — Pase\n/arena — PvP\n/help — ayuda',{parse_mode:'HTML'}));

bot.callbackQuery('profile',async ctx=>{await ctx.answerCallbackQuery();await ctx.reply('Abriendo progresión.',{reply_markup:new InlineKeyboard().webApp('PERFIL',gameUrlFor('progression'))});});
bot.callbackQuery('bastion',async ctx=>{await ctx.answerCallbackQuery();await ctx.reply('Abriendo Bastión.',{reply_markup:new InlineKeyboard().webApp('BASTIÓN',gameUrlFor('bastion'))});});
bot.callbackQuery('ranking',async ctx=>{await ctx.answerCallbackQuery();await ctx.reply('Abriendo rankings.',{reply_markup:new InlineKeyboard().webApp('RANKINGS',gameUrlFor('rankings'))});});
bot.callbackQuery('clan',async ctx=>{await ctx.answerCallbackQuery();await ctx.reply('Abriendo Clan 3.0.',{reply_markup:new InlineKeyboard().webApp('CLAN',gameUrlFor('clan'))});});
bot.catch(error=>console.error('Telegram bot error',error.error));

const app=new Hono();app.get('/health',c=>c.json({ok:true,service:'nexusrealms-bot',serverTime:new Date().toISOString()}));const telegramWebhook=webhookCallback(bot,'hono');app.post('/telegram/webhook',async c=>{const valid=c.req.header('x-telegram-bot-api-secret-token')===webhookSecret;console.log(`Telegram webhook request received: secret=${valid?'valid':'invalid'}`);if(!valid)return c.text('Forbidden',403);return telegramWebhook(c);});
async function configureBot(){const me=await bot.api.getMe();console.log('Telegram bot identity',{id:me.id,username:me.username,name:me.first_name});console.log('Mini App launch URL configured',{url:gameUrl.replace(/v=[^&]+/,'v=<cache-buster>')});await bot.api.setMyCommands([{command:'start',description:'Abrir Nexus Realms'},{command:'play',description:'Jugar'},{command:'profile',description:'Atributos y progreso'},{command:'quests',description:'Misiones'},{command:'clan',description:'Clan'},{command:'rewards',description:'Recompensas'},{command:'bastion',description:'Bastión'},{command:'events',description:'Eventos'},{command:'battlepass',description:'Pase de Batalla'},{command:'arena',description:'Arena PvP'},{command:'help',description:'Ayuda'}]);await bot.api.setChatMenuButton({menu_button:{type:'web_app',text:'JUGAR',web_app:{url:gameUrl}}});if(env.NODE_ENV==='production'&&env.BOT_PUBLIC_URL){const webhookUrl=`${env.BOT_PUBLIC_URL.replace(/\/$/,'')}/telegram/webhook`;await bot.api.setWebhook(webhookUrl,{secret_token:webhookSecret});const info=await bot.api.getWebhookInfo();console.log('Telegram webhook diagnostics',{url:info.url,pendingUpdateCount:info.pending_update_count,lastErrorDate:info.last_error_date??null,lastErrorMessage:info.last_error_message??null,maxConnections:info.max_connections??null});}}
await configureBot();if(env.NODE_ENV==='development')bot.start({onStart:info=>console.log(`Bot @${info.username} running in long-polling mode`)});else serve({fetch:app.fetch,port:env.PORT??env.BOT_PORT},info=>console.log(`Webhook server listening on :${info.port}`));
