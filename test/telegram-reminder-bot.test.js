'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createTelegramReminderBot } = require('../lib/telegram-reminder-bot');

const FIXED_NOW = Date.parse('2026-09-23T09:00:00.000Z');

async function withBot(enrollments, run, handlers = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quest-bot-'));
  const storePath = path.join(directory, 'reminder-store.json');
  const calls = [];
  fs.writeFileSync(storePath, JSON.stringify({ enrollments }, null, 2));
  const bot = createTelegramReminderBot({
    storePath,
    botUsername: 'CareerQuestRemindBot',
    now: () => FIXED_NOW,
    telegram: async (method, payload) => { calls.push({ method, payload }); return true; },
    onConfirm: handlers.onConfirm || (async () => undefined),
    onCancel: handlers.onCancel || (async () => undefined)
  });
  try { return await run({ bot, calls, storePath }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function futureEvent(overrides = {}) {
  return {
    id: 'event-1', activityTitle: 'System Design Lab', occursAt: '2026-09-24T09:30:00.000Z',
    timezone: 'Asia/Qyzylorda', status: 'active', telegramChatId: null, linkToken: 'valid-link', careerEnrollmentId: 'EN_CAREER_EVENT_1',
    linkExpiresAt: '2026-09-24T09:00:00.000Z', sentReminders: [], ...overrides
  };
}

test('start link connects a private chat once and offers event actions', async () => {
  await withBot([futureEvent()], async ({ bot, calls, storePath }) => {
    await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: '/start valid-link' } });
    const event = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0];
    assert.equal(event.telegramChatId, '77');
    assert.equal(event.linkToken, null);
    assert.equal(event.notificationsEnabled, true);
    assert.equal(calls[0].method, 'sendMessage');
    assert.match(calls[0].payload.text, /уведомления/i);
    assert.equal(calls[0].payload.reply_markup.inline_keyboard.length, 2);
  });
});

test('start link requires a present, valid and unexpired expiry time', async () => {
  for (const linkExpiresAt of [undefined, null, 'not-a-date', new Date(FIXED_NOW).toISOString()]) {
    await withBot([futureEvent({ linkExpiresAt })], async ({ bot, calls, storePath }) => {
      await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: '/start valid-link' } });
      const event = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0];
      assert.equal(event.telegramChatId, null);
      assert.equal(event.linkToken, 'valid-link');
      assert.match(calls.at(-1).payload.text, /уже использована или истекла/i);
    });
  }
});

test('events command accepts bot mentions and does not answer in groups', async () => {
  await withBot([futureEvent({ telegramChatId: '77' })], async ({ bot, calls }) => {
    await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: '/events@CareerQuestRemindBot' } });
    assert.equal(calls.filter(call => call.method === 'sendMessage').length, 2);
    await bot.processUpdate({ message: { chat: { id: -100, type: 'group' }, text: '/events' } });
    assert.equal(calls.filter(call => call.method === 'sendMessage').length, 2);
  });
});

test('confirmation and settings callbacks change only the caller records', async () => {
  await withBot([futureEvent({ telegramChatId: '77' }), futureEvent({ id: 'event-2', telegramChatId: '88', linkToken: null })], async ({ bot, calls, storePath }) => {
    await bot.processUpdate({ callback_query: { id: 'confirm-1', data: 'confirm:event-1', message: { chat: { id: 77, type: 'private' } } } });
    await bot.processUpdate({ callback_query: { id: 'settings-1', data: 'settings:off', message: { chat: { id: 77, type: 'private' } } } });
    const [first, second] = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments;
    assert.equal(first.status, 'confirmed');
    assert.equal(first.notificationsEnabled, false);
    assert.equal(second.notificationsEnabled, undefined);
    assert.deepEqual(calls.filter(call => call.method === 'answerCallbackQuery').map(call => call.payload.callback_query_id), ['confirm-1', 'settings-1']);
  });
});

test('bot cancellation delegates to the canonical enrollment before cancelling reminders', async () => {
  const cancelled = [];
  await withBot([futureEvent({ telegramChatId: '77' })], async ({ bot, storePath }) => {
    await bot.processUpdate({ callback_query: { id: 'cancel-1', data: 'cancel:event-1', message: { chat: { id: 77, type: 'private' } } } });
    const event = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0];
    assert.equal(event.status, 'cancelled');
  }, { onCancel: async enrollmentId => { cancelled.push(enrollmentId); } });
  assert.deepEqual(cancelled, ['EN_CAREER_EVENT_1']);
});

test('a rejected canonical cancellation leaves the reminder active', async () => {
  await withBot([futureEvent({ telegramChatId: '77' })], async ({ bot, storePath }) => {
    await bot.processUpdate({ callback_query: { id: 'cancel-1', data: 'cancel:event-1', message: { chat: { id: 77, type: 'private' } } } });
    const event = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0];
    assert.equal(event.status, 'active');
  }, { onCancel: async () => { throw new Error('Срок отмены участия уже прошёл'); } });
});

test('disconnect requires confirmation and removes the chat binding', async () => {
  await withBot([futureEvent({ telegramChatId: '77' })], async ({ bot, calls, storePath }) => {
    await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: '/disconnect' } });
    assert.equal(calls[0].payload.reply_markup.inline_keyboard[0][0].callback_data, 'disconnect:yes');
    await bot.processUpdate({ callback_query: { id: 'disconnect-1', data: 'disconnect:yes', message: { chat: { id: 77, type: 'private' } } } });
    const event = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0];
    assert.equal(event.telegramChatId, null);
    assert.equal(event.notificationsEnabled, false);
    assert.ok(event.disconnectedAt);
  });
});

test('due reminders include confirmed events, avoid late-message bursts, and remain idempotent', async () => {
  await withBot([futureEvent({ telegramChatId: '77', status: 'confirmed', occursAt: '2026-09-23T09:30:00.000Z' })], async ({ bot, calls, storePath }) => {
    const first = await bot.sendDueReminders();
    const second = await bot.sendDueReminders();
    const event = JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0];
    assert.deepEqual(first.sent.map(item => item.reminder), ['one_hour']);
    assert.deepEqual(second.sent, []);
    assert.deepEqual(event.sentReminders, ['seven_days', 'one_day', 'one_hour']);
    assert.equal(calls.filter(call => call.method === 'sendMessage').length, 1);
  });
});
