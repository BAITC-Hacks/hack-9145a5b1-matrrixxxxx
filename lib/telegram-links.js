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
    assertOwner(actor, body.employeeId);
    const required = ['employeeId', 'activityId', 'careerEnrollmentId', 'occursAt', 'timezone', 'channel'];
    if (required.some(key => typeof body[key] !== 'string' || !body[key].trim())) {
      throw new CareerStoreError('VALIDATION_ERROR', 'Заполните все поля записи');
    }
    if (body.channel !== 'telegram') {
      throw new CareerStoreError('VALIDATION_ERROR', 'Неподдерживаемый канал напоминаний');
    }
    const occursAt = new Date(body.occursAt).getTime();
    if (!Number.isFinite(occursAt) || occursAt <= now()) {
      throw new CareerStoreError('VALIDATION_ERROR', 'Выберите дату и время в будущем');
    }
    try { new Intl.DateTimeFormat('ru-RU', { timeZone: body.timezone }); }
    catch { throw new CareerStoreError('VALIDATION_ERROR', 'Укажите корректный часовой пояс'); }

    const careerEnrollment = careerStore.getEnrollment(body.careerEnrollmentId);
    assertOwner(actor, careerEnrollment.employeeId);
    if (careerEnrollment.activityId !== body.activityId) {
      throw new CareerStoreError('CONFLICT', 'Напоминание не соответствует записи Career Quest');
    }
    if (careerEnrollment.status === 'cancelled') {
      throw new CareerStoreError('CONFLICT', 'Запись на активность отменена');
    }
    const store = readStore();
    if (careerEnrollment.reminderEnrollmentId || store.enrollments.some(item => item.careerEnrollmentId === careerEnrollment.id)) {
      throw new CareerStoreError('CONFLICT', 'Напоминание уже создано. Получите новую ссылку в настройках уведомлений.');
    }
    const bootstrap = careerStore.getBootstrap(careerEnrollment.employeeId);
    const activity = bootstrap.activities.find(item => item.id === careerEnrollment.activityId);
    if (!activity) throw new CareerStoreError('CONFLICT', 'Активность больше недоступна для напоминания');

    const enrollment = {
      id: crypto.randomUUID(), careerEnrollmentId: careerEnrollment.id,
      employeeId: bootstrap.employee.id, employeeName: bootstrap.employee.name,
      activityId: activity.id, activityTitle: activity.title,
      occursAt: new Date(occursAt).toISOString(), timezone: body.timezone,
      channel: 'telegram', status: 'active', telegramChatId: null,
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
    assertOwner(actor, enrollment.employeeId);
    const careerEnrollment = careerStore.getEnrollment(enrollment.careerEnrollmentId);
    assertOwner(actor, careerEnrollment.employeeId);
    if (enrollment.telegramChatId) {
      throw new CareerStoreError('CONFLICT', 'Telegram для этой записи уже подключён');
    }
    if (!['active', 'confirmed'].includes(enrollment.status) || careerEnrollment.status === 'cancelled') {
      throw new CareerStoreError('CONFLICT', 'Нельзя подключить Telegram для отменённой записи');
    }
    if (!(new Date(enrollment.occursAt).getTime() > now())) {
      throw new CareerStoreError('CONFLICT', 'Мероприятие уже началось. Новую ссылку получить нельзя.');
    }
    const response = issueToken(enrollment);
    saveStore(store);
    return response;
  }

  return { list, create, renew };
}

module.exports = { LINK_TOKEN_TTL_MS, isTelegramConfigured, createTelegramLinks };
