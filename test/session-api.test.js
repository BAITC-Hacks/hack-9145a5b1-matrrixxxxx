'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const { seedStore } = require('../lib/career-store');

const TELEGRAM = { token: '123456:session-api-fixture', username: 'CareerQuestRemindBot' };

async function withServer(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quest-session-api-'));
  const dataDirectory = path.join(directory, 'data');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(path.join(dataDirectory, 'career-store.json'), JSON.stringify(seedStore()));
  fs.copyFileSync(path.join(__dirname, '..', 'server.js'), path.join(directory, 'server.js'));
  fs.mkdirSync(path.join(directory, 'lib'));
  for (const file of ['career-store.js', 'telegram-links.js', 'telegram-reminder-bot.js']) {
    fs.copyFileSync(path.join(__dirname, '..', 'lib', file), path.join(directory, 'lib', file));
  }
  const child = spawn(process.execPath, [path.join(directory, 'server.js')], {
    cwd: directory,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PORT: '0',
      NODE_ENV: 'test',
      CAREER_QUEST_DEV_AUTH: 'true',
      TELEGRAM_TRANSPORT: 'polling',
      TELEGRAM_BOT_TOKEN: TELEGRAM.token,
      TELEGRAM_BOT_USERNAME: TELEGRAM.username
    }
  });
  let exited;
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fixture server did not start')), 10000);
      let output = '';
      child.stdout.on('data', value => {
        output += value.toString();
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(Number(match[1]));
        }
      });
      child.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', code => {
        clearTimeout(timeout);
        reject(new Error('Fixture server exited: ' + code));
      });
    });
    async function request(url, options = {}) {
      const response = await fetch('http://127.0.0.1:' + port + url, {
        method: options.method || 'GET',
        headers: {
          ...(options.actor === '' ? {} : { 'x-career-quest-actor': options.actor || 'U_EMPLOYEE_E0028' }),
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
      });
      const raw = await response.text();
      let body = null;
      try { body = JSON.parse(raw); } catch { /* Calendar response is intentionally not JSON. */ }
      return { status: response.status, headers: response.headers, raw, body };
    }
    await run({ request });
  } finally {
    if (child.exitCode === null) {
      exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('session enrollment derives ownership and protects cancel, calendar, and reminder state', async () => {
  await withServer(async ({ request }) => {
    const detail = await request('/api/v1/activities/ACT_SYSTEM_DESIGN_LAB?employeeId=E0028');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.sessions[0].id, 'SES_SYSTEM_DESIGN_OCT');
    assert.equal(detail.body.sessions[0].timezone, 'Asia/Qyzylorda');

    const unsafeAlias = await request('/api/v1/enrollments', {
      method: 'POST',
      body: { employeeId: 'E0114', activityId: 'ACT_SYSTEM_DESIGN_LAB' }
    });
    assert.equal(unsafeAlias.status, 400);

    const created = await request('/api/v1/sessions/SES_SYSTEM_DESIGN_OCT/enrollments', {
      method: 'POST',
      body: { employeeId: 'E0114', activityId: 'forged', occursAt: '2099-01-01T00:00:00.000Z' }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.enrollment.employeeId, 'E0028');
    assert.equal(created.body.enrollment.activityId, 'ACT_SYSTEM_DESIGN_LAB');
    assert.equal(created.body.enrollment.sessionId, 'SES_SYSTEM_DESIGN_OCT');

    const reminder = await request('/api/enrollments', {
      method: 'POST',
      body: {
        careerEnrollmentId: created.body.enrollment.id,
        channel: 'telegram',
        employeeId: 'E0114',
        activityId: 'forged',
        occursAt: '2099-01-01T00:00:00.000Z',
        timezone: 'Mars/Base'
      }
    });
    assert.equal(reminder.status, 201);

    const calendarPath = '/api/v1/enrollments/' + encodeURIComponent(created.body.enrollment.id) + '/calendar.ics';
    const calendar = await request(calendarPath);
    assert.equal(calendar.status, 200);
    assert.match(calendar.headers.get('content-type'), /^text\/calendar/);
    assert.match(calendar.raw, /DTSTART:/);
    assert.match(calendar.raw, /DTEND:/);
    assert.doesNotMatch(calendar.raw, /Mars\/Base|telegramChatId|linkToken/i);

    assert.equal((await request(calendarPath, { actor: 'U_EMPLOYEE_E0114' })).status, 403);
    assert.equal((await request(calendarPath, { actor: 'U_MANAGER_BACKEND' })).status, 403);
    assert.equal((await request('/api/v1/enrollments/' + encodeURIComponent(created.body.enrollment.id) + '/cancel', {
      method: 'PATCH', actor: 'U_HR_DEVELOPMENT'
    })).status, 403);

    const cancelled = await request('/api/v1/enrollments/' + encodeURIComponent(created.body.enrollment.id) + '/cancel', { method: 'PATCH' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.enrollment.status, 'cancelled');

    const listed = await request('/api/telegram/enrollments');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.enrollments[0].status, 'cancelled');
    assert.equal('telegramChatId' in listed.body.enrollments[0], false);
    assert.equal('linkToken' in listed.body.enrollments[0], false);
  });
});
