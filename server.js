/*
 * Career Quest reminder service. Uses only Node.js built-ins so the MVP
 * starts without npm or a separate database. For production, replace the
 * JSON store with PostgreSQL and protect API endpoints with SSO.
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

loadEnv(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT || 4173);
const STORE_PATH = path.join(__dirname, 'data', 'reminder-store.json');
const STATIC_DIR = path.join(__dirname, 'dist');
const REMINDER_OFFSETS = [
  { key: 'seven_days', milliseconds: 7 * 24 * 60 * 60 * 1000, label: 'через 7 дней' },
  { key: 'one_day', milliseconds: 24 * 60 * 60 * 1000, label: 'завтра' },
  { key: 'one_hour', milliseconds: 60 * 60 * 1000, label: 'через 1 час' }
];

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function getStore() {
  if (!fs.existsSync(STORE_PATH)) return { enrollments: [] };
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return { enrollments: [] }; }
}
function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Некорректный JSON')); } });
    req.on('error', reject);
  });
}
function requireCronSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) { sendJson(res, 401, { error: 'Неверный секрет планировщика' }); return false; }
  return true;
}
function telegramRequest(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Promise.reject(new Error('TELEGRAM_BOT_TOKEN не задан'));
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'api.telegram.org', path: `/bot${token}/${method}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, response => {
      let text = ''; response.on('data', chunk => text += chunk); response.on('end', () => {
        try { const result = JSON.parse(text); result.ok ? resolve(result.result) : reject(new Error(result.description || 'Ошибка Telegram API')); }
        catch { reject(new Error('Некорректный ответ Telegram')); }
      });
    });
    request.on('error', reject); request.write(data); request.end();
  });
}
async function runReminders() {
  const now = Date.now(); const store = getStore(); const sent = []; const skipped = [];
  for (const enrollment of store.enrollments) {
    if (enrollment.status !== 'active' || !enrollment.telegramChatId) continue;
    const eventTime = new Date(enrollment.occursAt).getTime();
    if (!Number.isFinite(eventTime) || eventTime <= now) continue;
    for (const reminder of REMINDER_OFFSETS) {
      if (enrollment.sentReminders?.includes(reminder.key) || now < eventTime - reminder.milliseconds) continue;
      const when = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: enrollment.timezone || 'Asia/Almaty' }).format(new Date(enrollment.occursAt));
      try {
        await telegramRequest('sendMessage', { chat_id: enrollment.telegramChatId, text: `Напоминание: мероприятие «${enrollment.activityTitle}» состоится ${when} (${reminder.label}).` });
        enrollment.sentReminders = [...(enrollment.sentReminders || []), reminder.key]; sent.push({ enrollmentId: enrollment.id, reminder: reminder.key });
      } catch (error) { skipped.push({ enrollmentId: enrollment.id, reminder: reminder.key, error: error.message }); }
    }
  }
  saveStore(store); return { sent, skipped };
}
function safeStaticPath(urlPath) {
  const requested = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.resolve(STATIC_DIR, requested);
  return file.startsWith(STATIC_DIR) ? file : null;
}
function serveStatic(req, res) {
  const file = safeStaticPath(new URL(req.url, 'http://localhost').pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendJson(res, 404, { error: 'Не найдено' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/enrollments') {
      const body = await readBody(req);
      const required = ['employeeId', 'employeeName', 'activityId', 'activityTitle', 'occursAt', 'timezone', 'channel'];
      if (required.some(key => !body[key]) || !Number.isFinite(new Date(body.occursAt).getTime())) return sendJson(res, 400, { error: 'Заполните все поля записи' });
      const store = getStore(); const linkToken = crypto.randomBytes(24).toString('base64url');
      const enrollment = { id: crypto.randomUUID(), employeeId: String(body.employeeId), employeeName: String(body.employeeName), activityId: String(body.activityId), activityTitle: String(body.activityTitle), occursAt: new Date(body.occursAt).toISOString(), timezone: String(body.timezone), channel: 'telegram', status: 'active', linkToken, telegramChatId: null, sentReminders: [], createdAt: new Date().toISOString() };
      store.enrollments.push(enrollment); saveStore(store);
      const username = process.env.TELEGRAM_BOT_USERNAME;
      return sendJson(res, 201, { id: enrollment.id, telegramConnectUrl: username ? `https://t.me/${username.replace(/^@/, '')}?start=${linkToken}` : null });
    }
    if (req.method === 'POST' && url.pathname === '/api/telegram/webhook') {
      const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (configuredSecret && req.headers['x-telegram-bot-api-secret-token'] !== configuredSecret) return sendJson(res, 401, { error: 'Неверный секрет Telegram webhook' });
      const update = await readBody(req); const message = update.message;
      const token = message?.text?.match(/^\/start\s+([A-Za-z0-9_-]+)$/)?.[1];
      if (!token || !message?.chat?.id) return sendJson(res, 200, { ok: true });
      const store = getStore(); const enrollment = store.enrollments.find(item => item.linkToken === token && !item.telegramChatId);
      if (!enrollment) return sendJson(res, 200, { ok: true });
      enrollment.telegramChatId = String(message.chat.id); enrollment.linkedAt = new Date().toISOString(); enrollment.linkToken = null; saveStore(store);
      await telegramRequest('sendMessage', { chat_id: message.chat.id, text: `Готово! Напоминания о «${enrollment.activityTitle}» подключены.` });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/reminders/run') {
      if (!requireCronSecret(req, res)) return;
      return sendJson(res, 200, await runReminders());
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME) });
    if (req.method === 'GET') return serveStatic(req, res);
    return sendJson(res, 405, { error: 'Метод не поддерживается' });
  } catch (error) { console.error(error); return sendJson(res, 500, { error: error.message || 'Внутренняя ошибка' }); }
});
server.listen(PORT, () => console.log(`Career Quest: http://localhost:${PORT}`));
