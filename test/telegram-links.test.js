'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const { createCareerStore } = require('../lib/career-store');
const { createTelegramLinks, LINK_TOKEN_TTL_MS } = require('../lib/telegram-links');
const { createTelegramReminderBot } = require('../lib/telegram-reminder-bot');

const FIXED_NOW = Date.parse('2026-09-23T09:00:00.000Z');
const CONFIG = { transport: 'polling', token: '123456:test-fixture', username: 'CareerQuestRemindBot' };

async function withLinks(run, config = CONFIG) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quest-links-'));
  const storePath = path.join(directory, 'reminder-store.json');
  const careerStore = createCareerStore(path.join(directory, 'career-store.json'));
  const actor = careerStore.getActor('U_EMPLOYEE_E0028');
  const careerEnrollment = careerStore.createEnrollment({ employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB' });
  const input = {
    employeeId: actor.employeeId, activityId: careerEnrollment.activityId, careerEnrollmentId: careerEnrollment.id,
    occursAt: '2026-10-01T09:00:00.000Z', timezone: 'Asia/Qyzylorda', channel: 'telegram'
  };
  let currentTime = FIXED_NOW;
  const now = () => currentTime;
  const links = createTelegramLinks({ storePath, careerStore, config, now });
  const calls = [];
  const bot = createTelegramReminderBot({
    storePath, now, telegram: async (method, payload) => { calls.push({ method, payload }); return true; }
  });
  try {
    await run({ directory, storePath, careerStore, actor, careerEnrollment, input, links, bot, calls,
      advance: milliseconds => { currentTime += milliseconds; } });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('creation returns a 24-hour personal link and lists only safe fields', async () => {
  await withLinks(({ links, actor, input, careerStore, storePath }) => {
    const result = links.create(actor, { ...input, employeeName: 'spoofed', activityTitle: 'spoofed' });
    assert.match(result.telegramConnectUrl, /^https:\/\/t\.me\/CareerQuestRemindBot\?start=[A-Za-z0-9_-]{32}$/);
    assert.equal(Date.parse(result.linkExpiresAt) - FIXED_NOW, LINK_TOKEN_TTL_MS);
    assert.equal(careerStore.getEnrollment(input.careerEnrollmentId).reminderEnrollmentId, result.id);
    const [enrollment] = links.list(actor);
    assert.deepEqual(Object.keys(enrollment).sort(), [
      'id', 'careerEnrollmentId', 'activityTitle', 'occursAt', 'timezone', 'status', 'connected', 'linkExpiresAt'
    ].sort());
    assert.equal(enrollment.connected, false);
    assert.notEqual(enrollment.activityTitle, 'spoofed');
    assert.notEqual(JSON.parse(fs.readFileSync(storePath, 'utf8')).enrollments[0].employeeName, 'spoofed');
    assert.throws(() => links.create(actor, input), { code: 'CONFLICT' });
  });
});

test('only the employee owning the record can list, create or renew links', async () => {
  await withLinks(({ links, actor, input, careerStore }) => {
    const result = links.create(actor, input);
    const stranger = careerStore.getActor('U_EMPLOYEE_E0114');
    assert.deepEqual(links.list(stranger), []);
    assert.throws(() => links.create(stranger, input), { code: 'FORBIDDEN' });
    assert.throws(() => links.create(stranger, { ...input, employeeId: stranger.employeeId }), { code: 'FORBIDDEN' });
    assert.throws(() => links.renew(stranger, result.id), { code: 'FORBIDDEN' });
    for (const roleId of ['U_MANAGER_BACKEND', 'U_HR_DEVELOPMENT', 'U_ADMIN_PLATFORM']) {
      const staff = careerStore.getActor(roleId);
      assert.throws(() => links.list(staff), { code: 'FORBIDDEN' });
      assert.throws(() => links.create(staff, input), { code: 'FORBIDDEN' });
      assert.throws(() => links.renew(staff, result.id), { code: 'FORBIDDEN' });
    }
  });
});

test('renewal invalidates the old link without another enrollment and new link is single-use', async () => {
  await withLinks(async ({ links, actor, input, bot, advance, careerStore }) => {
    const first = links.create(actor, input);
    advance(1000);
    const renewed = links.renew(actor, first.id);
    assert.equal(renewed.id, first.id);
    assert.notEqual(renewed.telegramConnectUrl, first.telegramConnectUrl);
    assert.equal(Date.parse(renewed.linkExpiresAt), FIXED_NOW + 1000 + LINK_TOKEN_TTL_MS);
    assert.equal(links.list(actor).length, 1);
    assert.equal(careerStore.getBootstrap(actor.employeeId).enrollments.length, 1);
    const open = (url, id) => bot.processUpdate({ message: {
      chat: { id, type: 'private' }, text: `/start ${new URL(url).searchParams.get('start')}`
    } });
    await open(first.telegramConnectUrl, 77);
    assert.equal(links.list(actor)[0].connected, false);
    await open(renewed.telegramConnectUrl, 77);
    assert.equal(links.list(actor)[0].connected, true);
    await open(renewed.telegramConnectUrl, 88);
    assert.equal(bot.readStore().enrollments[0].telegramChatId, '77');
    assert.equal(bot.readStore().enrollments[0].linkToken, null);
    assert.throws(() => links.renew(actor, first.id), { code: 'CONFLICT' });
  });
});

test('an expired link cannot connect and can be renewed for a future event', async () => {
  await withLinks(async ({ links, actor, input, bot, advance }) => {
    const first = links.create(actor, input);
    advance(LINK_TOKEN_TTL_MS);
    await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: `/start ${new URL(first.telegramConnectUrl).searchParams.get('start')}` } });
    assert.equal(links.list(actor)[0].connected, false);
    const renewed = links.renew(actor, first.id);
    await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: `/start ${new URL(renewed.telegramConnectUrl).searchParams.get('start')}` } });
    assert.equal(links.list(actor)[0].connected, true);
  });
});

test('renewal rejects cancelled or past events but supports reconnecting after disconnect', async () => {
  await withLinks(async ({ links, actor, input, bot, advance }) => {
    const first = links.create(actor, input);
    await bot.processUpdate({ message: { chat: { id: 77, type: 'private' }, text: `/start ${new URL(first.telegramConnectUrl).searchParams.get('start')}` } });
    await bot.processUpdate({ callback_query: { id: 'disconnect', data: 'disconnect:yes', message: { chat: { id: 77, type: 'private' } } } });
    assert.doesNotThrow(() => links.renew(actor, first.id));
    const store = bot.readStore();
    store.enrollments[0].status = 'cancelled';
    bot.saveStore(store);
    assert.throws(() => links.renew(actor, first.id), { code: 'CONFLICT' });
    store.enrollments[0].status = 'active';
    bot.saveStore(store);
    advance(20 * LINK_TOKEN_TTL_MS);
    assert.throws(() => links.renew(actor, first.id), { code: 'CONFLICT' });
  });
});

test('invalid dates, timezones and bodies never persist reminders', async () => {
  await withLinks(({ links, actor, input }) => {
    for (const body of [null, [], { ...input, occursAt: 'not-a-date' },
      { ...input, occursAt: new Date(FIXED_NOW).toISOString() }, { ...input, timezone: 'Mars/Base' }]) {
      assert.throws(() => links.create(actor, body), { code: 'VALIDATION_ERROR' });
    }
    assert.deepEqual(links.list(actor), []);
  });
});

test('disabled or unconfigured Telegram rejects creation and renewal', async () => {
  for (const config of [{ ...CONFIG, transport: 'disabled' }, { ...CONFIG, token: '' },
    { ...CONFIG, token: '123456:replace_me' }, { ...CONFIG, username: '' }]) {
    await withLinks(({ links, actor, input }) => {
      assert.throws(() => links.create(actor, input), { code: 'TELEGRAM_UNAVAILABLE' });
      assert.throws(() => links.renew(actor, 'unused'), { code: 'TELEGRAM_UNAVAILABLE' });
      assert.deepEqual(links.list(actor), []);
    }, config);
  }
});

test('HTTP routes require authentication and return correct status codes without exposing tokens', async () => {
  await withLinks(async ({ directory }) => {
    // A standalone fixture prevents reading the real .env or project data and never contacts Telegram.
    fs.copyFileSync(path.join(__dirname, '..', 'server.js'), path.join(directory, 'server.js'));
    fs.mkdirSync(path.join(directory, 'lib'));
    for (const filename of ['career-store.js', 'telegram-links.js', 'telegram-reminder-bot.js']) {
      fs.copyFileSync(path.join(__dirname, '..', 'lib', filename), path.join(directory, 'lib', filename));
    }
    const child = spawn(process.execPath, [path.join(directory, 'server.js')], {
      cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, PORT: '0', NODE_ENV: 'test', CAREER_QUEST_DEV_AUTH: 'true',
        TELEGRAM_TRANSPORT: 'polling', TELEGRAM_BOT_TOKEN: CONFIG.token, TELEGRAM_BOT_USERNAME: CONFIG.username }
    });
    const exited = once(child, 'exit');
    try {
      const port = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Fixture server did not start')), 10000);
        let output = '';
        child.stdout.on('data', data => {
          output += data.toString();
          const match = output.match(/http:\/\/localhost:(\d+)/);
          if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
        });
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Fixture exited: ${code}`)); });
      });
      const request = async (url, { actor = 'U_EMPLOYEE_E0028', body, method = 'GET' } = {}) => {
        const response = await fetch(`http://127.0.0.1:${port}${url}`, {
          method, headers: { ...(actor ? { 'x-career-quest-actor': actor } : {}), 'content-type': 'application/json' },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        return { status: response.status, body: await response.json() };
      };
      assert.equal((await request('/api/telegram/enrollments', { actor: '' })).status, 401);
      assert.equal((await request('/api/telegram/enrollments', { actor: 'U_HR_DEVELOPMENT' })).status, 403);
      assert.equal((await request('/api/enrollments', { method: 'POST', body: null })).status, 400);
      const enrolled = await request('/api/v1/enrollments', {
        method: 'POST', body: { employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB' }
      });
      assert.equal(enrolled.status, 201);
      const created = await request('/api/enrollments', { method: 'POST', body: {
        employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB', careerEnrollmentId: enrolled.body.enrollment.id,
        occursAt: new Date(Date.now() + 10 * LINK_TOKEN_TTL_MS).toISOString(), timezone: 'Asia/Qyzylorda', channel: 'telegram'
      } });
      assert.equal(created.status, 201);
      const renewalPath = `/api/telegram/enrollments/${created.body.id}/link`;
      assert.equal((await request(renewalPath, { method: 'POST', actor: '' })).status, 401);
      assert.equal((await request(renewalPath, { method: 'POST', actor: 'U_EMPLOYEE_E0114' })).status, 403);
      assert.equal((await request('/api/telegram/enrollments/missing/link', { method: 'POST' })).status, 404);
      const renewed = await request(renewalPath, { method: 'POST' });
      assert.equal(renewed.status, 200);
      assert.notEqual(renewed.body.telegramConnectUrl, created.body.telegramConnectUrl);
      const listed = await request('/api/telegram/enrollments');
      assert.equal(listed.status, 200);
      assert.equal(listed.body.enrollments.length, 1);
      assert.equal('linkToken' in listed.body.enrollments[0], false);
      assert.equal('telegramChatId' in listed.body.enrollments[0], false);
    } finally {
      child.kill();
      await exited;
    }
  });
});
