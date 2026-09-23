'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REMINDER_STAGES = [
  { key: 'seven_days', milliseconds: 7 * 24 * 60 * 60 * 1000, label: 'через 7 дней' },
  { key: 'one_day', milliseconds: 24 * 60 * 60 * 1000, label: 'завтра' },
  { key: 'one_hour', milliseconds: 60 * 60 * 1000, label: 'через 1 час' }
];

const COMMANDS = [
  { command: 'start', description: 'Подключить уведомления' },
  { command: 'events', description: 'Мои ближайшие события' },
  { command: 'settings', description: 'Настроить напоминания' },
  { command: 'disconnect', description: 'Отключить Telegram' },
  { command: 'help', description: 'Как пользоваться ботом' }
];

function createTelegramRequest(token) {
  if (!token || token === '123456:replace_me') throw new Error('TELEGRAM_BOT_TOKEN не задан');
  return (method, payload) => {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: 'POST',
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
          } catch {
            reject(new Error(`Telegram returned invalid JSON (${response.statusCode})`));
          }
        });
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    });
  };
}

function createTelegramReminderBot({ storePath, token, botUsername = '', telegram, now = () => Date.now(), onConfirm, onCancel }) {
  if (!storePath) throw new Error('storePath обязателен');
  const api = telegram || createTelegramRequest(token);
  const normalizedUsername = String(botUsername).replace(/^@/, '').trim();

  function readStore() {
    if (!fs.existsSync(storePath)) return { enrollments: [] };
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      return { ...store, enrollments: Array.isArray(store.enrollments) ? store.enrollments : [] };
    } catch {
      // A broken store must not make the bot expose records from an unknown shape.
      return { enrollments: [] };
    }
  }

  function saveStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
    fs.renameSync(temporaryPath, storePath);
  }

  function isUpcoming(event) {
    const time = new Date(event.occursAt).getTime();
    return Number.isFinite(time) && time > now();
  }

  function formatEvent(event) {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'long', timeStyle: 'short', timeZone: event.timezone || 'Asia/Qyzylorda'
    }).format(new Date(event.occursAt));
  }

  function eventKeyboard(event) {
    const rows = [];
    if (event.status !== 'confirmed' && event.careerEnrollmentId && typeof onConfirm === 'function') {
      rows.push([{ text: '✓ Подтверждаю участие', callback_data: `confirm:${event.id}` }]);
    }
    const actions = [{ text: 'В календарь', callback_data: `calendar:${event.id}` }];
    if (event.careerEnrollmentId && typeof onCancel === 'function') actions.push({ text: 'Отменить запись', callback_data: `cancel:${event.id}` });
    rows.push(actions);
    return { inline_keyboard: rows };
  }

  function dashboardKeyboard() {
    return { inline_keyboard: [[
      { text: '📅 Мои события', callback_data: 'menu:events' },
      { text: '⚙️ Настройки', callback_data: 'menu:settings' }
    ]] };
  }

  function linkedEvents(chatId) {
    return readStore().enrollments.filter(event => String(event.telegramChatId) === String(chatId));
  }

  function googleCalendarUrl(event) {
    const start = new Date(event.occursAt);
    const end = new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60 * 1000);
    const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const query = new URLSearchParams({
      action: 'TEMPLATE', text: event.activityTitle, dates: `${stamp(start)}/${stamp(end)}`,
      ctz: event.timezone || 'Asia/Qyzylorda'
    });
    return `https://calendar.google.com/calendar/render?${query}`;
  }

  function eventText(event, prefix = '📅') {
    const status = event.status === 'confirmed' ? 'участие подтверждено' : 'вы записаны';
    return `${prefix} ${event.activityTitle}\n${formatEvent(event)}\nСтатус: ${status}`;
  }

  async function sendWelcome(chatId) {
    return api('sendMessage', {
      chat_id: chatId,
      text: '👋 Привет! Я Career Quest — ваш помощник по мероприятиям развития.\n\nЯ покажу ближайшие события, напомню о них и помогу подтвердить участие. Чтобы подключить конкретную запись, откройте персональную ссылку из Career Quest.',
      reply_markup: dashboardKeyboard()
    });
  }

  async function sendEvents(chatId) {
    const events = linkedEvents(chatId)
      .filter(event => event.status !== 'cancelled' && isUpcoming(event))
      .sort((left, right) => new Date(left.occursAt) - new Date(right.occursAt));
    if (!events.length) {
      return api('sendMessage', {
        chat_id: chatId,
        text: 'Пока нет ближайших мероприятий. Запишитесь на активность в Career Quest — она сразу появится здесь.',
        reply_markup: dashboardKeyboard()
      });
    }
    await api('sendMessage', { chat_id: chatId, text: `Ваши ближайшие события: ${events.length}` });
    for (const event of events) {
      await api('sendMessage', { chat_id: chatId, text: eventText(event), reply_markup: eventKeyboard(event) });
    }
  }

  async function sendSettings(chatId) {
    const events = linkedEvents(chatId).filter(event => event.status !== 'cancelled');
    if (!events.length) {
      return api('sendMessage', { chat_id: chatId, text: 'Сначала подключите запись по персональной ссылке из Career Quest.', reply_markup: dashboardKeyboard() });
    }
    const enabled = events.some(event => event.notificationsEnabled !== false);
    return api('sendMessage', {
      chat_id: chatId,
      text: `Напоминания ${enabled ? 'включены' : 'выключены'} для всех ваших активных записей. По умолчанию я пишу за 7 дней, 24 часа и 1 час до события.`,
      reply_markup: { inline_keyboard: [
        [{ text: enabled ? 'Выключить напоминания' : 'Включить напоминания', callback_data: `settings:${enabled ? 'off' : 'on'}` }],
        [{ text: 'Отключить Telegram', callback_data: 'disconnect:confirm' }]
      ] }
    });
  }

  async function handleStart(message, linkCode) {
    const chatId = message.chat.id;
    if (!linkCode) return sendWelcome(chatId);
    const store = readStore();
    const event = store.enrollments.find(item =>
      item.linkToken === linkCode &&
      item.status !== 'cancelled' &&
      (!item.telegramChatId || String(item.telegramChatId) === String(chatId)) &&
      (!item.linkExpiresAt || new Date(item.linkExpiresAt).getTime() > now())
    );
    if (!event) {
      return api('sendMessage', {
        chat_id: chatId,
        text: 'Эта ссылка уже использована или истекла. Откройте в Career Quest страницу «Подключить Telegram» и нажмите «Получить новую ссылку» у нужного мероприятия. Если подключение уже есть, используйте /events.',
        reply_markup: dashboardKeyboard()
      });
    }
    event.telegramChatId = String(chatId);
    event.linkToken = null;
    event.linkedAt = new Date(now()).toISOString();
    event.notificationsEnabled = true;
    saveStore(store);
    return api('sendMessage', {
      chat_id: chatId,
      text: `Готово! Уведомления о «${event.activityTitle}» подключены.`,
      reply_markup: eventKeyboard(event)
    });
  }

  function commandMatch(text, command) {
    const username = normalizedUsername ? `(?:@${normalizedUsername})?` : '(?:@[A-Za-z0-9_]+)?';
    return new RegExp(`^/${command}${username}$`, 'i').test(text);
  }

  async function handleMessage(message) {
    if (!message?.chat?.id || (message.chat.type && message.chat.type !== 'private')) return;
    if (typeof message.text !== 'string') return;
    const text = String(message.text || '').trim();
    const username = normalizedUsername ? `(?:@${normalizedUsername})?` : '(?:@[A-Za-z0-9_]+)?';
    const start = text.match(new RegExp(`^/start${username}(?:\\s+([A-Za-z0-9_-]+))?$`, 'i'));
    if (start) return handleStart(message, start[1]);
    if (commandMatch(text, 'events')) return sendEvents(message.chat.id);
    if (commandMatch(text, 'settings')) return sendSettings(message.chat.id);
    if (commandMatch(text, 'disconnect')) {
      return api('sendMessage', {
        chat_id: message.chat.id,
        text: 'Отключить этот чат от Career Quest? Напоминания прекратятся. Подключить новые записи можно будет по персональной ссылке из Career Quest.',
        reply_markup: { inline_keyboard: [[
          { text: 'Отключить', callback_data: 'disconnect:yes' },
          { text: 'Не сейчас', callback_data: 'disconnect:no' }
        ]] }
      });
    }
    if (commandMatch(text, 'help')) {
      return api('sendMessage', {
        chat_id: message.chat.id,
        text: 'Доступные команды:\n/events — ближайшие мероприятия\n/settings — включить или выключить напоминания\n/disconnect — отключить этот чат\n/start — главное меню\n\nДля подключения записи откройте персональную ссылку из Career Quest.',
        reply_markup: dashboardKeyboard()
      });
    }
    return api('sendMessage', { chat_id: message.chat.id, text: 'Используйте /events, чтобы увидеть мероприятия, или /help, чтобы открыть подсказку.', reply_markup: dashboardKeyboard() });
  }

  async function answerCallback(callback, text) {
    return api('answerCallbackQuery', { callback_query_id: callback.id, ...(text ? { text } : {}) });
  }

  async function handleCallback(callback) {
    const chatId = callback.message?.chat?.id;
    if (!chatId || (callback.message.chat.type && callback.message.chat.type !== 'private')) return;
    const [action, eventId] = String(callback.data || '').split(':', 2);
    if (action === 'menu') {
      if (!['events', 'settings'].includes(eventId)) return answerCallback(callback, 'Команда устарела.');
      await answerCallback(callback);
      return eventId === 'events' ? sendEvents(chatId) : sendSettings(chatId);
    }
    if (action === 'settings') {
      const enabled = eventId === 'on';
      if (!['on', 'off'].includes(eventId)) return answerCallback(callback, 'Команда устарела.');
      const store = readStore();
      let changed = false;
      for (const event of store.enrollments) {
        if (String(event.telegramChatId) === String(chatId) && event.status !== 'cancelled') {
          event.notificationsEnabled = enabled;
          changed = true;
        }
      }
      if (changed) saveStore(store);
      await answerCallback(callback, enabled ? 'Напоминания включены' : 'Напоминания выключены');
      return api('sendMessage', { chat_id: chatId, text: enabled ? '🔔 Напоминания включены.' : '🔕 Напоминания выключены.' });
    }
    if (action === 'disconnect') {
      if (eventId === 'confirm') {
        await answerCallback(callback);
        return api('sendMessage', {
          chat_id: chatId,
          text: 'Отключить этот чат от Career Quest? Напоминания прекратятся.',
          reply_markup: { inline_keyboard: [[
            { text: 'Отключить', callback_data: 'disconnect:yes' },
            { text: 'Не сейчас', callback_data: 'disconnect:no' }
          ]] }
        });
      }
      if (eventId === 'no') return answerCallback(callback, 'Подключение сохранено');
      if (eventId !== 'yes') return answerCallback(callback, 'Команда устарела.');
      const store = readStore();
      let disconnected = false;
      for (const event of store.enrollments) {
        if (String(event.telegramChatId) === String(chatId)) {
          event.telegramChatId = null;
          event.notificationsEnabled = false;
          event.disconnectedAt = new Date(now()).toISOString();
          disconnected = true;
        }
      }
      if (disconnected) saveStore(store);
      await answerCallback(callback, disconnected ? 'Telegram отключён' : 'Подключение не найдено');
      return api('sendMessage', { chat_id: chatId, text: disconnected ? 'Telegram отключён. Больше сообщений не будет.' : 'Активное подключение не найдено.' });
    }

    const store = readStore();
    const event = store.enrollments.find(item => item.id === eventId && String(item.telegramChatId) === String(chatId));
    if (!event || event.status === 'cancelled') return answerCallback(callback, 'Эта запись недоступна.');
    if (action === 'confirm') {
      if (!event.careerEnrollmentId || typeof onConfirm !== 'function') return answerCallback(callback, 'Подтвердите участие в Career Quest.');
      try { await onConfirm(event.careerEnrollmentId, event); }
      catch (error) { return answerCallback(callback, error.message || 'Не удалось подтвердить участие.'); }
      event.status = 'confirmed';
      event.confirmedAt = new Date(now()).toISOString();
      saveStore(store);
      await answerCallback(callback, 'Участие подтверждено');
      return api('sendMessage', { chat_id: chatId, text: `✓ Участие в «${event.activityTitle}» подтверждено. До встречи!` });
    }
    if (action === 'cancel') {
      if (!event.careerEnrollmentId || typeof onCancel !== 'function') return answerCallback(callback, 'Отмените запись в Career Quest.');
      try { await onCancel(event.careerEnrollmentId, event); }
      catch (error) { return answerCallback(callback, error.message || 'Не удалось отменить запись.'); }
      event.status = 'cancelled';
      event.cancelledAt = new Date(now()).toISOString();
      saveStore(store);
      await answerCallback(callback, 'Запись отменена');
      return api('sendMessage', { chat_id: chatId, text: `Запись на «${event.activityTitle}» отменена. Напоминания больше не придут.` });
    }
    if (action === 'calendar') {
      await answerCallback(callback);
      return api('sendMessage', {
        chat_id: chatId,
        text: 'Добавьте мероприятие в календарь:',
        reply_markup: { inline_keyboard: [[{ text: 'Открыть календарь', url: googleCalendarUrl(event) }]] }
      });
    }
    return answerCallback(callback, 'Неизвестное действие.');
  }

  async function processUpdate(update) {
    if (update?.message) return handleMessage(update.message);
    if (update?.callback_query) return handleCallback(update.callback_query);
  }

  async function sendDueReminders() {
    const store = readStore();
    const currentTime = now();
    const sent = [];
    const skipped = [];
    let changed = false;
    for (const event of store.enrollments) {
      if (!event.telegramChatId || event.notificationsEnabled === false || !['active', 'confirmed'].includes(event.status) || !isUpcoming(event)) continue;
      event.sentReminders ||= [];
      const startsAt = new Date(event.occursAt).getTime();
      const dueStages = REMINDER_STAGES.filter(stage => !event.sentReminders.includes(stage.key) && currentTime >= startsAt - stage.milliseconds);
      // If the scheduler was unavailable, deliver only the most relevant
      // pending reminder instead of surprising a person with three late messages.
      const stage = dueStages.at(-1);
      if (stage) {
        try {
          await api('sendMessage', {
            chat_id: event.telegramChatId,
            text: `⏰ Напоминание: «${event.activityTitle}» состоится ${formatEvent(event)} (${stage.label}).`,
            reply_markup: eventKeyboard(event)
          });
          // Mark all older stages as handled too: they are represented by this
          // one, timely message and must not be delivered on the next run.
          event.sentReminders.push(...dueStages.map(item => item.key));
          sent.push({ enrollmentId: event.id, reminder: stage.key });
          changed = true;
        } catch (error) {
          skipped.push({ enrollmentId: event.id, reminder: stage.key, error: error.message });
        }
      }
    }
    if (changed) saveStore(store);
    return { sent, skipped };
  }

  async function configureCommands() {
    await api('setMyCommands', { commands: COMMANDS });
  }

  return { processUpdate, sendDueReminders, configureCommands, readStore, saveStore };
}

module.exports = { COMMANDS, REMINDER_STAGES, createTelegramRequest, createTelegramReminderBot };
