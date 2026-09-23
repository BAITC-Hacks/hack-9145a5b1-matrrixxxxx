'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { CareerStoreError } = require('./career-store');

const LINK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function isTelegramConfigured({ transport, token, username }) {
  const name = String(username || '').trim().replace(/^@/, '');
  return ['polling', 'webhook'].includes(transport) &&
    Boolean(token && token !== '123456:replace_me') && /^[A-Za-z0-9_]{5,32}$/.test(name);
}

function createTelegramLinks({ storePath, careerStore, config, now = () => Date.now() }) {
  function readStore() {
    if (!fs.existsSync(storePath)) return { enrollments: [] };
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (!store || !Array.isArray(store.enrollments)) throw new Error('Invalid reminder store');
      return store;
    } catch {
      throw new CareerStoreError('STORE_CORRUPTED', 'Не удалось прочитать хранилище напоминаний');
    }
  }

  function saveStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
    fs.renameSync(temporaryPath, storePath);
  }

  function assertOwner(actor, employeeId = actor?.employeeId) {
    if (!actor || actor.role !== 'employee' || !employeeId || actor.employeeId !== employeeId) {
      throw new CareerStoreError('FORBIDDEN', 'Подключить личные напоминания может только сам сотрудник');
    }
  }

  function assertConfigured() {
    if (!isTelegramConfigured(config)) {
      throw new CareerStoreError('TELEGRAM_UNAVAILABLE', 'Telegram-напоминания пока недоступны. Попробуйте позже.');
    }
  }

  // A reminder is only a delivery projection.  The Career Quest enrollment
  // and its session stay authoritative even after a reminder was created:
  // HR can reschedule a session and a participant can confirm or cancel it.
  // Keep all issue/renew decisions and refreshed fields tied to that source.
  function getCanonicalReminderContext(careerEnrollmentId) {
    const context = careerStore.getEnrollmentContext(careerEnrollmentId);
    const careerEnrollment = context?.enrollment;
    if (!careerEnrollment?.employeeId) {
      throw new CareerStoreError('CONFLICT', 'Запись Career Quest больше недоступна для Telegram-напоминаний');
    }
    if (!['enrolled', 'confirmed'].includes(careerEnrollment.status)) {
      throw new CareerStoreError('CONFLICT', 'Telegram можно подключить только к действующей записи на сессию');
    }

    const session = context.session;
    // `availability` also closes at the registration deadline.  That must not
    // revoke an already enrolled participant's ability to receive reminders.
    if (!session || session.status !== 'scheduled') {
      throw new CareerStoreError('CONFLICT', 'Сессия недоступна для Telegram-напоминаний');
    }
    const occursAt = new Date(session.startsAt).getTime();
    const endsAt = new Date(session.endsAt).getTime();
    if (!Number.isFinite(occursAt) || !Number.isFinite(endsAt) || occursAt <= now() || endsAt <= occursAt) {
      throw new CareerStoreError('CONFLICT', 'Сессия уже началась или имеет неверное расписание');
    }
    try { new Intl.DateTimeFormat('ru-RU', { timeZone: session.timezone }); }
    catch { throw new CareerStoreError('CONFLICT', 'У сессии указан неверный часовой пояс'); }

    const activity = context.activity;
    const employee = careerStore.getBootstrap(careerEnrollment.employeeId).employee;
    if (!activity?.id || !activity.title || !employee?.id || !employee.name) {
      throw new CareerStoreError('CONFLICT', 'Активность больше недоступна для напоминания');
    }
    return { careerEnrollment, session, activity, employee, occursAt, endsAt };
  }

  function synchronizeFromCanonicalEnrollment(reminder, canonical) {
    const nextOccursAt = new Date(canonical.occursAt).toISOString();
    const nextDurationMinutes = Math.round((canonical.endsAt - canonical.occursAt) / 60000);
    const scheduleChanged = reminder.sessionId !== canonical.session.id ||
      reminder.occursAt !== nextOccursAt ||
      reminder.timezone !== canonical.session.timezone ||
      reminder.durationMinutes !== nextDurationMinutes;

    reminder.employeeId = canonical.employee.id;
    reminder.employeeName = canonical.employee.name;
    reminder.activityId = canonical.activity.id;
    reminder.activityTitle = canonical.activity.title;
    reminder.sessionId = canonical.session.id;
    reminder.occursAt = nextOccursAt;
    reminder.timezone = canonical.session.timezone;
    reminder.durationMinutes = nextDurationMinutes;
    reminder.status = canonical.careerEnrollment.status === 'confirmed' ? 'confirmed' : 'active';
    // If an HR reschedule changes the slot, notifications already sent for the
    // old slot must not suppress the new schedule's reminders.
    if (scheduleChanged) reminder.sentReminders = [];
  }

  function issueToken(enrollment) {
    enrollment.linkToken = crypto.randomBytes(24).toString('base64url');
    enrollment.linkExpiresAt = new Date(now() + LINK_TOKEN_TTL_MS).toISOString();
    enrollment.updatedAt = new Date(now()).toISOString();
    return {
      id: enrollment.id,
      telegramConnectUrl: `https://t.me/${String(config.username).trim().replace(/^@/, '')}?start=${enrollment.linkToken}`,
      linkExpiresAt: enrollment.linkExpiresAt
    };
  }

  function list(actor) {
    assertOwner(actor);
    return readStore().enrollments.filter(item => item.employeeId === actor.employeeId).map(item => ({
      id: item.id,
      careerEnrollmentId: item.careerEnrollmentId,
      activityTitle: item.activityTitle,
      occursAt: item.occursAt,
      timezone: item.timezone,
      status: item.status,
      connected: Boolean(item.telegramChatId),
      linkExpiresAt: item.linkExpiresAt || null
    }));
  }

  function create(actor, body) {
    assertOwner(actor);
    assertConfigured();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new CareerStoreError('VALIDATION_ERROR', 'Тело запроса должно быть объектом');
    }
    if (typeof body.careerEnrollmentId !== 'string' || !body.careerEnrollmentId.trim()) {
      throw new CareerStoreError('VALIDATION_ERROR', 'Укажите запись Career Quest');
    }
    if (body.channel !== 'telegram') {
      throw new CareerStoreError('VALIDATION_ERROR', 'Неподдерживаемый канал напоминаний');
    }

    // The browser is deliberately not a source of truth for the event.  Older
    // clients may still send employeeId, title, date, timezone, etc.; all of
    // those fields are ignored in favour of the enrollment's canonical session.
    const canonical = getCanonicalReminderContext(body.careerEnrollmentId.trim());
    const { careerEnrollment, session, activity, employee, occursAt, endsAt } = canonical;
    assertOwner(actor, careerEnrollment.employeeId);

    const store = readStore();
    if (careerEnrollment.reminderEnrollmentId || store.enrollments.some(item => item.careerEnrollmentId === careerEnrollment.id)) {
      throw new CareerStoreError('CONFLICT', 'Напоминание уже создано. Получите новую ссылку в настройках уведомлений.');
    }
    const enrollment = {
      id: crypto.randomUUID(), careerEnrollmentId: careerEnrollment.id,
      employeeId: employee.id, employeeName: employee.name,
      activityId: activity.id, activityTitle: activity.title,
      sessionId: session.id, occursAt: new Date(occursAt).toISOString(), timezone: session.timezone,
      durationMinutes: Math.round((endsAt - occursAt) / 60000),
      channel: 'telegram', status: careerEnrollment.status === 'confirmed' ? 'confirmed' : 'active', telegramChatId: null,
      sentReminders: [], createdAt: new Date(now()).toISOString()
    };
    const response = issueToken(enrollment);
    store.enrollments.push(enrollment);
    saveStore(store);
    careerStore.attachReminder(enrollment.careerEnrollmentId, enrollment.id);
    return response;
  }

  function renew(actor, enrollmentId) {
    assertOwner(actor);
    assertConfigured();
    const store = readStore();
    const enrollment = store.enrollments.find(item => item.id === enrollmentId);
    if (!enrollment) throw new CareerStoreError('NOT_FOUND', 'Напоминание не найдено');
    if (!['active', 'confirmed'].includes(enrollment.status)) {
      throw new CareerStoreError('CONFLICT', 'Нельзя подключить Telegram для отменённой записи');
    }
    const canonical = getCanonicalReminderContext(enrollment.careerEnrollmentId);
    const { careerEnrollment } = canonical;
    assertOwner(actor, careerEnrollment.employeeId);
    if (careerEnrollment.reminderEnrollmentId !== enrollment.id) {
      throw new CareerStoreError('CONFLICT', 'Связь напоминания с записью Career Quest больше неактуальна');
    }
    if (enrollment.telegramChatId) {
      throw new CareerStoreError('CONFLICT', 'Telegram для этой записи уже подключён');
    }
    synchronizeFromCanonicalEnrollment(enrollment, canonical);
    const response = issueToken(enrollment);
    saveStore(store);
    return response;
  }

  // This is called by the Career Quest enrollment-cancellation endpoint.  All
  // matching active reminders are written in one atomic store replacement, so
  // a cancelled enrollment cannot retain a usable Telegram link or reminders.
  function cancelForCareerEnrollment(careerEnrollmentId) {
    if (typeof careerEnrollmentId !== 'string' || !careerEnrollmentId.trim()) {
      throw new CareerStoreError('VALIDATION_ERROR', 'Укажите запись Career Quest');
    }
    const normalizedCareerEnrollmentId = careerEnrollmentId.trim();
    const store = readStore();
    let changed = false;
    const cancelledAt = new Date(now()).toISOString();
    for (const enrollment of store.enrollments) {
      if (enrollment.careerEnrollmentId !== normalizedCareerEnrollmentId || !['active', 'confirmed'].includes(enrollment.status)) continue;
      enrollment.status = 'cancelled';
      enrollment.cancelledAt = cancelledAt;
      enrollment.updatedAt = cancelledAt;
      enrollment.linkToken = null;
      enrollment.linkExpiresAt = null;
      enrollment.notificationsEnabled = false;
      changed = true;
    }
    if (changed) saveStore(store);
    return changed;
  }

  return { list, create, renew, cancelForCareerEnrollment };
}

module.exports = { LINK_TOKEN_TTL_MS, isTelegramConfigured, createTelegramLinks };
