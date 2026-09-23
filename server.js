/*
 * Career Quest reminder service. Uses only Node.js built-ins so the MVP
 * starts without npm or a separate database. For production, replace the
 * JSON store with PostgreSQL and protect API endpoints with SSO.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CareerStoreError, createCareerStore } = require('./lib/career-store');
const { createTelegramReminderBot } = require('./lib/telegram-reminder-bot');

loadEnv(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT || 4173);
const STORE_PATH = path.join(__dirname, 'data', 'reminder-store.json');
const CAREER_STORE_PATH = path.join(__dirname, 'data', 'career-store.json');
const STATIC_DIR = path.join(__dirname, 'dist');
const careerStore = createCareerStore(CAREER_STORE_PATH);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TELEGRAM_TRANSPORT = String(process.env.TELEGRAM_TRANSPORT || 'polling').trim().toLowerCase();
const LINK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

if (!['polling', 'webhook', 'disabled'].includes(TELEGRAM_TRANSPORT)) {
  throw new Error('TELEGRAM_TRANSPORT должен быть polling, webhook или disabled.');
}
if (IS_PRODUCTION && process.env.CAREER_QUEST_DEV_AUTH === 'true') {
  throw new Error('CAREER_QUEST_DEV_AUTH нельзя включать в production. Настройте корпоративный SSO.');
}
if (IS_PRODUCTION && TELEGRAM_TRANSPORT === 'webhook' && (!process.env.CRON_SECRET || !process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.TELEGRAM_BOT_TOKEN)) {
  throw new Error('Для Telegram webhook в production обязательны TELEGRAM_BOT_TOKEN, CRON_SECRET и TELEGRAM_WEBHOOK_SECRET.');
}

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
  const temporaryPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
  fs.renameSync(temporaryPath, STORE_PATH);
}
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  res.end(JSON.stringify(payload));
}
function sendCareerError(res, error) {
  if (!(error instanceof CareerStoreError)) throw error;
  const statusByCode = { VALIDATION_ERROR: 400, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409, STORE_CORRUPTED: 500 };
  return sendJson(res, statusByCode[error.code] || 500, { error: error.message, code: error.code });
}
function requireCareerActor(req, res) {
  if (process.env.CAREER_QUEST_DEV_AUTH !== 'true') {
    sendJson(res, 503, { error: 'Career API выключен. Для локальной разработки задайте CAREER_QUEST_DEV_AUTH=true.', code: 'CAREER_API_DISABLED' });
    return null;
  }
  const actorId = req.headers['x-career-quest-actor'];
  if (typeof actorId !== 'string' || !actorId) {
    sendJson(res, 401, { error: 'Передайте x-career-quest-actor для локальной разработки.', code: 'UNAUTHENTICATED' });
    return null;
  }
  try { return careerStore.getActor(actorId); }
  catch (error) {
    if (error instanceof CareerStoreError) sendJson(res, 401, { error: 'Неизвестный actor.', code: 'UNAUTHENTICATED' });
    else throw error;
    return null;
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new CareerStoreError('VALIDATION_ERROR', 'Некорректный JSON')); } });
    req.on('error', reject);
  });
}
function requireCronSecret(req, res) {
  if (TELEGRAM_TRANSPORT !== 'webhook') {
    sendJson(res, 409, { error: 'Планировщик reminder доступен только в режиме TELEGRAM_TRANSPORT=webhook.' });
    return false;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === 'replace_with_a_long_random_value') { sendJson(res, 503, { error: 'CRON_SECRET не настроен.' }); return false; }
  if (req.headers['x-cron-secret'] !== secret) { sendJson(res, 401, { error: 'Неверный секрет планировщика' }); return false; }
  return true;
}
let webhookBot;
function getWebhookBot() {
  if (!webhookBot) {
    webhookBot = createTelegramReminderBot({
      storePath: STORE_PATH,
      token: process.env.TELEGRAM_BOT_TOKEN,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || 'CareerQuestRemindBot'
    });
  }
  return webhookBot;
}
function resolveStaticEntry(pathname) {
  if (pathname === '/') return 'landing.html';
  if (pathname === '/sign-in') return 'sign-in.html';
  if (pathname === '/legacy-demo') return 'index.html';
  if (/^\/(?:app|manager|hr|admin)(?:\/|$)/.test(pathname)) return 'workspace.html';
  return pathname;
}
function safeStaticPath(urlPath) {
  let requested;
  try { requested = decodeURIComponent(urlPath).replace(/^\/+/, ''); }
  catch { return null; }
  const file = path.resolve(STATIC_DIR, requested);
  const relative = path.relative(STATIC_DIR, file);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return file;
}
function serveStatic(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = safeStaticPath(resolveStaticEntry(pathname));
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendJson(res, 404, { error: 'Не найдено' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" }); fs.createReadStream(file).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/bootstrap') {
      const actor = requireCareerActor(req, res); if (!actor) return;
      const employeeId = url.searchParams.get('employeeId') || actor.employeeId;
      try {
        careerStore.assertCanAccessEmployee(actor, employeeId);
        return sendJson(res, 200, careerStore.getBootstrap(employeeId));
      } catch (error) { return sendCareerError(res, error); }
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/activities') {
      const actor = requireCareerActor(req, res); if (!actor) return;
      const employeeId = url.searchParams.get('employeeId');
      if (!employeeId) return sendJson(res, 400, { error: 'Укажите employeeId', code: 'VALIDATION_ERROR' });
      try {
        careerStore.assertCanAccessEmployee(actor, employeeId);
        return sendJson(res, 200, { activities: careerStore.listActivities(employeeId) });
      } catch (error) { return sendCareerError(res, error); }
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/hr/activities') {
      const actor = requireCareerActor(req, res); if (!actor) return;
      try {
        careerStore.assertCanManageActivities(actor);
        return sendJson(res, 200, { activities: careerStore.listAllActivities() });
      } catch (error) { return sendCareerError(res, error); }
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/activities') {
      const actor = requireCareerActor(req, res); if (!actor) return;
      try {
        careerStore.assertCanManageActivities(actor);
        return sendJson(res, 201, { activity: careerStore.createActivity(await readBody(req)) });
      } catch (error) { return sendCareerError(res, error); }
    }
    const activityMatch = url.pathname.match(/^\/api\/v1\/activities\/([^/]+)$/);
    if (req.method === 'PATCH' && activityMatch) {
      const actor = requireCareerActor(req, res); if (!actor) return;
      try {
        careerStore.assertCanManageActivities(actor);
        return sendJson(res, 200, { activity: careerStore.updateActivity(decodeURIComponent(activityMatch[1]), await readBody(req)) });
      } catch (error) { return sendCareerError(res, error); }
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/enrollments') {
      const actor = requireCareerActor(req, res); if (!actor) return;
      try {
        const body = await readBody(req);
        careerStore.assertCanAccessEmployee(actor, body.employeeId);
        return sendJson(res, 201, { enrollment: careerStore.createEnrollment(body) });
      }
      catch (error) { return sendCareerError(res, error); }
    }
    const evidenceMatch = url.pathname.match(/^\/api\/v1\/enrollments\/([^/]+)\/evidence$/);
    if (req.method === 'POST' && evidenceMatch) {
      const actor = requireCareerActor(req, res); if (!actor) return;
      try {
        const enrollmentId = decodeURIComponent(evidenceMatch[1]);
        careerStore.assertCanAccessEmployee(actor, careerStore.getEnrollment(enrollmentId).employeeId);
        return sendJson(res, 200, { enrollment: careerStore.submitEvidence(enrollmentId, await readBody(req)) });
      }
      catch (error) { return sendCareerError(res, error); }
    }
    if (req.method === 'POST' && url.pathname === '/api/enrollments') {
      const actor = requireCareerActor(req, res); if (!actor) return;
      const body = await readBody(req);
      const required = ['employeeId', 'activityId', 'occursAt', 'timezone', 'channel'];
      if (required.some(key => !body[key]) || !Number.isFinite(new Date(body.occursAt).getTime())) return sendJson(res, 400, { error: 'Заполните все поля записи' });
      if (body.channel !== 'telegram') return sendJson(res, 400, { error: 'Неподдерживаемый канал напоминаний' });
      if (!body.careerEnrollmentId) return sendJson(res, 400, { error: 'Напоминание должно быть связано с записью Career Quest' });
      if (actor.role !== 'employee' || actor.employeeId !== String(body.employeeId)) return sendJson(res, 403, { error: 'Подключить личные напоминания может только сам сотрудник' });
      try { new Intl.DateTimeFormat('ru-RU', { timeZone: String(body.timezone) }); }
      catch { return sendJson(res, 400, { error: 'Укажите корректный часовой пояс' }); }
      let careerEnrollment;
      let employee;
      let activity;
      try {
        careerEnrollment = careerStore.getEnrollment(String(body.careerEnrollmentId));
        careerStore.assertCanAccessEmployee(actor, careerEnrollment.employeeId);
        if (careerEnrollment.employeeId !== String(body.employeeId) || careerEnrollment.activityId !== String(body.activityId)) {
          return sendJson(res, 409, { error: 'Reminder не соответствует записи Career Quest' });
        }
        if (careerEnrollment.reminderEnrollmentId) return sendJson(res, 409, { error: 'Напоминания для этой записи уже подключены' });
        const bootstrap = careerStore.getBootstrap(careerEnrollment.employeeId);
        employee = bootstrap.employee;
        activity = bootstrap.activities.find(item => item.id === careerEnrollment.activityId);
        if (!activity) return sendJson(res, 409, { error: 'Активность больше недоступна для напоминания' });
      } catch (error) { return sendCareerError(res, error); }
      const store = getStore(); const linkToken = crypto.randomBytes(24).toString('base64url');
      const enrollment = { id: crypto.randomUUID(), careerEnrollmentId: String(body.careerEnrollmentId), employeeId: employee.id, employeeName: employee.name, activityId: activity.id, activityTitle: activity.title, occursAt: new Date(body.occursAt).toISOString(), timezone: String(body.timezone), channel: 'telegram', status: 'active', linkToken, linkExpiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString(), telegramChatId: null, sentReminders: [], createdAt: new Date().toISOString() };
      store.enrollments.push(enrollment); saveStore(store);
      careerStore.attachReminder(enrollment.careerEnrollmentId, enrollment.id);
      const username = process.env.TELEGRAM_BOT_USERNAME;
      return sendJson(res, 201, { id: enrollment.id, telegramConnectUrl: username ? `https://t.me/${username.replace(/^@/, '')}?start=${linkToken}` : null });
    }
    if (req.method === 'POST' && url.pathname === '/api/telegram/webhook') {
      if (TELEGRAM_TRANSPORT !== 'webhook') return sendJson(res, 409, { error: 'Webhook выключен: используется Telegram polling или notifications отключены.' });
      const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (!configuredSecret || configuredSecret === 'replace_with_a_different_long_random_value') return sendJson(res, 503, { error: 'TELEGRAM_WEBHOOK_SECRET не настроен.' });
      if (req.headers['x-telegram-bot-api-secret-token'] !== configuredSecret) return sendJson(res, 401, { error: 'Неверный секрет Telegram webhook' });
      await getWebhookBot().processUpdate(await readBody(req));
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/reminders/run') {
      if (!requireCronSecret(req, res)) return;
      return sendJson(res, 200, await getWebhookBot().sendDueReminders());
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME) });
    if (req.method === 'GET') return serveStatic(req, res);
    return sendJson(res, 405, { error: 'Метод не поддерживается' });
  } catch (error) { console.error(error); return sendJson(res, 500, { error: error.message || 'Внутренняя ошибка' }); }
});
server.listen(PORT, () => {
  console.log(`Career Quest: http://localhost:${PORT}`);
  if (TELEGRAM_TRANSPORT === 'webhook' && process.env.TELEGRAM_BOT_TOKEN) {
    getWebhookBot().configureCommands().catch(error => console.error(`Не удалось настроить команды Telegram: ${error.message}`));
  }
});
