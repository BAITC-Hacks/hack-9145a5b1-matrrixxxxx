/*
 * Local long-polling runner for Career Quest Telegram notifications.
 * Webhook mode uses exactly the same bot core from server.js.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createTelegramRequest, createTelegramReminderBot } = require('./lib/telegram-reminder-bot');
const { createCareerStore } = require('./lib/career-store');

const ROOT = __dirname;
const POLL_TIMEOUT_SECONDS = 25;
loadEnv(path.join(ROOT, '.env'));

const token = process.env.TELEGRAM_BOT_TOKEN;
const transport = String(process.env.TELEGRAM_TRANSPORT || 'polling').trim().toLowerCase();
if (!token || token === '123456:replace_me') {
  console.error('Укажите TELEGRAM_BOT_TOKEN в файле .env. Токен не должен попадать в исходный код.');
  process.exit(1);
}
if (transport !== 'polling') {
  console.error('CareerQuestRemindBot работает только с TELEGRAM_TRANSPORT=polling. Для webhook запускайте только server.js.');
  process.exit(1);
}

function loadEnv(filename) {
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const telegram = createTelegramRequest(token);
const careerStore = createCareerStore(path.join(ROOT, 'data', 'career-store.json'));
const bot = createTelegramReminderBot({
  storePath: path.join(ROOT, 'data', 'reminder-store.json'),
  botUsername: process.env.TELEGRAM_BOT_USERNAME || 'CareerQuestRemindBot',
  telegram,
  onConfirm: enrollmentId => careerStore.confirmEnrollment(enrollmentId),
  onCancel: enrollmentId => careerStore.cancelEnrollment(enrollmentId)
});

let nextOffset = 0;
let running = true;

async function poll() {
  while (running) {
    try {
      const updates = await telegram('getUpdates', {
        offset: nextOffset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message', 'callback_query']
      });
      for (const update of updates) {
        nextOffset = update.update_id + 1;
        try { await bot.processUpdate(update); }
        catch (error) { console.error(`Update ${update.update_id} failed: ${error.message}`); }
      }
    } catch (error) {
      console.error(`Polling error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

async function start() {
  // Telegram cannot send updates to a webhook and a polling client at once.
  await telegram('deleteWebhook', { drop_pending_updates: false });
  await bot.configureCommands();
  await bot.sendDueReminders();
  setInterval(() => bot.sendDueReminders().catch(error => console.error(`Reminder error: ${error.message}`)), 60 * 1000);
  console.log('CareerQuestRemindBot запущен в режиме long polling.');
  return poll();
}

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });
start().catch(error => { console.error(`Не удалось запустить Telegram-бота: ${error.message}`); process.exitCode = 1; });
