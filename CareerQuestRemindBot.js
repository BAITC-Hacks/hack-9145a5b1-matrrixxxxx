/*
 * CareerQuestRemindBot
 *
 * Standalone Telegram process for Career Quest. It shares the enrollment
 * store with server.js, which creates enrollment records from the website.
 * The implementation intentionally has no npm dependencies.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = __dirname;
const STORE_PATH = path.join(ROOT, 'data', 'reminder-store.json');
const OFFSETS = [
  { key: 'seven_days', ms: 7 * 24 * 60 * 60 * 1000, label: 'через 7 дней' },
  { key: 'one_day', ms: 24 * 60 * 60 * 1000, label: 'завтра' },
  { key: 'one_hour', ms: 60 * 60 * 1000, label: 'через 1 час' }
];

loadEnv(path.join(ROOT, '.env'));
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const POLL_TIMEOUT_SECONDS = 25;

if (!TOKEN || TOKEN === '123456:replace_me') {
  console.error('Укажите TELEGRAM_BOT_TOKEN в файле .env. Токен не должен попадать в исходный код.');
  process.exit(1);
}

function loadEnv(filename) {
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return { enrollments: [] };
  try {
    const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { enrollments: Array.isArray(store.enrollments) ? store.enrollments : [] };
  } catch {
    return { enrollments: [] };
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
  fs.renameSync(temporary, STORE_PATH);
}

function telegram(method, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.telegram.org', path: `/bot${TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed.ok) return reject(new Error(parsed.description || `Telegram API error ${response.statusCode}`));
          resolve(parsed.result);
        } catch { reject(new Error(`Telegram returned invalid JSON (${response.statusCode})`)); }
      });
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function formatEvent(event) {
  const date = new Date(event.occursAt);
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: event.timezone || 'Asia/Qyzylorda'
  }).format(date);
}

function eventKeyboard(event) {
  return {
    inline_keyboard: [
      [{ text: '✓ Подтверждаю участие', callback_data: `confirm:${event.id}` }],
      [{ text: 'Добавить в календарь', callback_data: `calendar:${event.id}` }, { text: 'Отменить запись', callback_data: `cancel:${event.id}` }]
    ]
  };
}

function findForChat(chatId) {
  return readStore().enrollments.filter(event => String(event.telegramChatId) === String(chatId));
}

function googleCalendarUrl(event) {
  const start = new Date(event.occursAt);
  const end = new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60 * 1000);
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const query = new URLSearchParams({ action: 'TEMPLATE', text: event.activityTitle, dates: `${stamp(start)}/${stamp(end)}`, ctz: event.timezone || 'Asia/Qyzylorda' });
  return `https://calendar.google.com/calendar/render?${query}`;
}

async function sendEvents(chatId) {
  const events = findForChat(chatId)
    .filter(event => event.status !== 'cancelled' && new Date(event.occursAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.occursAt) - new Date(b.occursAt));
  if (!events.length) return telegram('sendMessage', { chat_id: chatId, text: 'Ближайших мероприятий пока нет. Запишитесь на активность в Career Quest — она появится здесь.' });
  for (const event of events) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: `📅 ${event.activityTitle}\n${formatEvent(event)}\nСтатус: ${event.status === 'confirmed' ? 'участие подтверждено' : 'записаны'}`,
      reply_markup: eventKeyboard(event)
    });
  }
}

async function handleStart(message, linkCode) {
  if (!linkCode) {
    return telegram('sendMessage', { chat_id: message.chat.id, text: 'Здравствуйте! Я Career Quest Remind Bot. Напомню о ваших мероприятиях по развитию.\n\nКоманды:\n/events — ближайшие мероприятия\n/settings — настройки уведомлений' });
  }
  const store = readStore();
  const event = store.enrollments.find(item => item.linkToken === linkCode && !item.telegramChatId && item.status !== 'cancelled');
  if (!event) return telegram('sendMessage', { chat_id: message.chat.id, text: 'Ссылка уже использована или недействительна. Вернитесь на сайт Career Quest и создайте новую запись.' });
  event.telegramChatId = String(message.chat.id);
  event.linkToken = null;
  event.linkedAt = new Date().toISOString();
  event.notificationsEnabled = true;
  saveStore(store);
  await telegram('sendMessage', { chat_id: message.chat.id, text: `Готово! Напоминания о «${event.activityTitle}» подключены.`, reply_markup: eventKeyboard(event) });
}

async function handleSettings(chatId) {
  const events = findForChat(chatId).filter(event => event.status !== 'cancelled');
  if (!events.length) return telegram('sendMessage', { chat_id: chatId, text: 'Сначала привяжите аккаунт через ссылку с сайта Career Quest.' });
  const enabled = events.some(event => event.notificationsEnabled !== false);
  return telegram('sendMessage', {
    chat_id: chatId,
    text: `Напоминания сейчас ${enabled ? 'включены' : 'выключены'}.`,
    reply_markup: { inline_keyboard: [[{ text: enabled ? 'Выключить напоминания' : 'Включить напоминания', callback_data: `settings:${enabled ? 'off' : 'on'}` }]] }
  });
}

async function handleMessage(message) {
  const text = String(message.text || '').trim();
  const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]+))?$/i);
  if (start) return handleStart(message, start[1]);
  if (/^\/events$/i.test(text)) return sendEvents(message.chat.id);
  if (/^\/settings$/i.test(text)) return handleSettings(message.chat.id);
  if (/^\/help$/i.test(text)) return telegram('sendMessage', { chat_id: message.chat.id, text: 'Используйте /events, чтобы посмотреть записи, или /settings, чтобы настроить уведомления.' });
  return telegram('sendMessage', { chat_id: message.chat.id, text: 'Не понял команду. Попробуйте /events или /settings.' });
}

async function handleCallback(callback) {
  const [action, eventId] = String(callback.data || '').split(':');
  const chatId = callback.message?.chat?.id;
  const store = readStore();
  const event = store.enrollments.find(item => item.id === eventId && String(item.telegramChatId) === String(chatId));
  if (action === 'settings') {
    const enabled = eventId === 'on';
    for (const item of store.enrollments) if (String(item.telegramChatId) === String(chatId) && item.status !== 'cancelled') item.notificationsEnabled = enabled;
    saveStore(store);
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: enabled ? 'Напоминания включены' : 'Напоминания выключены' });
    return telegram('sendMessage', { chat_id: chatId, text: enabled ? 'Напоминания включены.' : 'Напоминания выключены.' });
  }
  if (!event) return telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Запись не найдена или недоступна.' });
  if (action === 'confirm') {
    event.status = 'confirmed'; event.confirmedAt = new Date().toISOString(); saveStore(store);
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Участие подтверждено.' });
    return telegram('sendMessage', { chat_id: chatId, text: 'Участие подтверждено. До встречи на мероприятии!' });
  }
  if (action === 'cancel') {
    event.status = 'cancelled'; event.cancelledAt = new Date().toISOString(); saveStore(store);
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Запись отменена.' });
    return telegram('sendMessage', { chat_id: chatId, text: 'Запись отменена. Напоминания больше не придут.' });
  }
  if (action === 'calendar') {
    await telegram('answerCallbackQuery', { callback_query_id: callback.id });
    return telegram('sendMessage', { chat_id: chatId, text: 'Добавьте мероприятие в календарь:', reply_markup: { inline_keyboard: [[{ text: 'Открыть календарь', url: googleCalendarUrl(event) }]] } });
  }
}

async function sendDueReminders() {
  const store = readStore();
  const now = Date.now();
  let changed = false;
  for (const event of store.enrollments) {
    if (!event.telegramChatId || event.notificationsEnabled === false || !['active', 'confirmed'].includes(event.status)) continue;
    const startsAt = new Date(event.occursAt).getTime();
    if (!Number.isFinite(startsAt) || startsAt <= now) continue;
    event.sentReminders ||= [];
    for (const reminder of OFFSETS) {
      if (now < startsAt - reminder.ms || event.sentReminders.includes(reminder.key)) continue;
      await telegram('sendMessage', { chat_id: event.telegramChatId, text: `⏰ Напоминание: «${event.activityTitle}» состоится ${formatEvent(event)} (${reminder.label}).`, reply_markup: eventKeyboard(event) });
      event.sentReminders.push(reminder.key); changed = true;
    }
  }
  if (changed) saveStore(store);
}

let nextOffset = 0;
let running = true;
async function poll() {
  while (running) {
    try {
      const updates = await telegram('getUpdates', { offset: nextOffset, timeout: POLL_TIMEOUT_SECONDS, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        nextOffset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
        if (update.callback_query) await handleCallback(update.callback_query);
      }
    } catch (error) {
      console.error(`Polling error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

setInterval(() => sendDueReminders().catch(error => console.error(`Reminder error: ${error.message}`)), 60 * 1000);
sendDueReminders().catch(error => console.error(`Reminder error: ${error.message}`));
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });
console.log('CareerQuestRemindBot запущен в режиме long polling.');
poll();
