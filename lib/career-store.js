const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class CareerStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SKILLS = {
  SK_SYSTEM_DESIGN: 'System Design',
  SK_PYTHON: 'Python',
  SK_PUBLIC_SPEAKING: 'Public Speaking',
  SK_SQL: 'SQL',
  SK_DATA_STORYTELLING: 'Data Storytelling',
  SK_LEADERSHIP: 'Leadership',
  SK_PRODUCT_STRATEGY: 'Product Strategy',
  SK_ANALYTICS: 'Analytics'
};

function now() { return new Date().toISOString(); }

function futureRange(daysFromNow, startHourUtc, durationHours) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysFromNow);
  start.setUTCHours(startHourUtc, 0, 0, 0);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function seedStore() {
  const createdAt = now();
  const systemDesignSession = futureRange(14, 10, 6);
  const dataStorytellingSession = futureRange(17, 9, 4);
  const leadershipSession = futureRange(21, 10, 8);
  return {
    schemaVersion: 2,
    createdAt,
    updatedAt: createdAt,
    employees: [
      {
        id: 'E0028', name: 'Алия Нуржанова', role: 'Backend Engineer', grade: 'Middle', targetGrade: 'Senior', tenureMonths: 52,
        readiness: 68, requirements: '5 из 7 требований уже закрыты', recommendedActivityId: 'ACT_SYSTEM_DESIGN_LAB',
        targetSkillLevels: { SK_SYSTEM_DESIGN: 4, SK_PYTHON: 4, SK_PUBLIC_SPEAKING: 2 },
        skills: { SK_SYSTEM_DESIGN: 2, SK_PYTHON: 3, SK_PUBLIC_SPEAKING: 2 }
      },
      {
        id: 'E0114', name: 'Данияр Сагинов', role: 'Data Analyst', grade: 'Junior', targetGrade: 'Middle', tenureMonths: 18,
        readiness: 57, requirements: '4 из 7 требований уже закрыты', recommendedActivityId: 'ACT_DATA_STORYTELLING_LAB',
        targetSkillLevels: { SK_SQL: 4, SK_DATA_STORYTELLING: 3, SK_PYTHON: 3 },
        skills: { SK_SQL: 3, SK_DATA_STORYTELLING: 1, SK_PYTHON: 2 }
      },
      {
        id: 'E0192', name: 'Айгерим Касымова', role: 'Product Manager', grade: 'Middle', targetGrade: 'Senior', tenureMonths: 39,
        readiness: 74, requirements: '6 из 8 требований уже закрыты', recommendedActivityId: 'ACT_LEADERSHIP_PRACTICE',
        targetSkillLevels: { SK_PRODUCT_STRATEGY: 4, SK_LEADERSHIP: 4, SK_ANALYTICS: 4 },
        skills: { SK_PRODUCT_STRATEGY: 3, SK_LEADERSHIP: 2, SK_ANALYTICS: 4 }
      }
    ],
    users: [
      { id: 'U_EMPLOYEE_E0028', role: 'employee', employeeId: 'E0028' },
      { id: 'U_EMPLOYEE_E0114', role: 'employee', employeeId: 'E0114' },
      { id: 'U_EMPLOYEE_E0192', role: 'employee', employeeId: 'E0192' },
      { id: 'U_MANAGER_BACKEND', role: 'manager', directReportEmployeeIds: ['E0028'] },
      { id: 'U_HR_DEVELOPMENT', role: 'hr' },
      { id: 'U_ADMIN_PLATFORM', role: 'admin' }
    ],
    activities: [
      {
        id: 'ACT_SYSTEM_DESIGN_LAB', status: 'published', title: 'System Design: от схемы к решению',
        description: 'Практикум по проектированию устойчивых сервисов.', skillId: 'SK_SYSTEM_DESIGN', skillImpact: 1,
        format: 'Практикум', durationHours: 6, eligibility: { roles: ['Backend Engineer'], grades: ['Middle', 'Senior'] }
      },
      {
        id: 'ACT_DATA_STORYTELLING_LAB', status: 'published', title: 'Data Storytelling Lab',
        description: 'Практика построения убедительной истории на основе данных.', skillId: 'SK_DATA_STORYTELLING', skillImpact: 1,
        format: 'Практика', durationHours: 4, eligibility: { roles: ['Data Analyst'], grades: ['Junior', 'Middle'] }
      },
      {
        id: 'ACT_LEADERSHIP_PRACTICE', status: 'published', title: 'Leadership через практику',
        description: 'Кросс-функциональный проект с регулярной обратной связью.', skillId: 'SK_LEADERSHIP', skillImpact: 1,
        format: 'Проект', durationHours: 8, eligibility: { roles: ['Product Manager'], grades: ['Middle', 'Senior'] }
      }
    ],
    sessions: [
      {
        id: 'SES_SYSTEM_DESIGN_OCT', activityId: 'ACT_SYSTEM_DESIGN_LAB', status: 'scheduled',
        ...systemDesignSession, timezone: 'Asia/Qyzylorda', locationType: 'online',
        locationValue: 'Онлайн · ссылка появится после записи', capacity: 16,
        registrationDeadline: new Date(new Date(systemDesignSession.startsAt).getTime() - 60 * 60 * 1000).toISOString()
      },
      {
        id: 'SES_DATA_STORYTELLING_OCT', activityId: 'ACT_DATA_STORYTELLING_LAB', status: 'scheduled',
        ...dataStorytellingSession, timezone: 'Asia/Qyzylorda', locationType: 'online',
        locationValue: 'Онлайн · групповая сессия', capacity: 18,
        registrationDeadline: new Date(new Date(dataStorytellingSession.startsAt).getTime() - 60 * 60 * 1000).toISOString()
      },
      {
        id: 'SES_LEADERSHIP_OCT', activityId: 'ACT_LEADERSHIP_PRACTICE', status: 'scheduled',
        ...leadershipSession, timezone: 'Asia/Qyzylorda', locationType: 'hybrid',
        locationValue: 'Гибрид · kick-off в офисе', capacity: 12,
        registrationDeadline: new Date(new Date(leadershipSession.startsAt).getTime() - 24 * 60 * 60 * 1000).toISOString()
      }
    ],
    enrollments: [],
    progressEvents: []
  };
}

function assertObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CareerStoreError('VALIDATION_ERROR', message);
}

function assertText(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new CareerStoreError('VALIDATION_ERROR', `Поле ${field} заполнено неверно`);
  }
  return value.trim();
}

function assertPositiveInteger(value, field, maxValue) {
  if (!Number.isInteger(value) || value < 1 || value > maxValue) {
    throw new CareerStoreError('VALIDATION_ERROR', `Поле ${field} заполнено неверно`);
  }
  return value;
}

function assertEligibility(value) {
  assertObject(value, 'Eligibility заполнен неверно');
  const readList = (list, field) => {
    if (!Array.isArray(list) || !list.length || list.some(item => typeof item !== 'string' || !item.trim() || item.length > 100)) {
      throw new CareerStoreError('VALIDATION_ERROR', `Поле eligibility.${field} заполнено неверно`);
    }
    return [...new Set(list.map(item => item.trim()))];
  };
  return { roles: readList(value.roles, 'roles'), grades: readList(value.grades, 'grades') };
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return seedStore();
  try {
    const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assertObject(store, 'Хранилище повреждено');
    for (const key of ['employees', 'users', 'activities', 'enrollments', 'progressEvents']) {
      if (!Array.isArray(store[key])) throw new CareerStoreError('STORE_CORRUPTED', 'Хранилище имеет неверную структуру');
    }
    // Backward-compatible migration for local MVP data created before sessions.
    if (!Array.isArray(store.sessions)) store.sessions = seedStore().sessions;
    for (const enrollment of store.enrollments) {
      if (!enrollment.sessionId) enrollment.sessionId = store.sessions.find(session => session.activityId === enrollment.activityId)?.id || null;
    }
    store.schemaVersion = Math.max(Number(store.schemaVersion) || 1, 2);
    return store;
  } catch (error) {
    if (error instanceof CareerStoreError) throw error;
    throw new CareerStoreError('STORE_CORRUPTED', 'Не удалось прочитать хранилище Career Quest');
  }
}

function writeJson(filePath, store) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = now();
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function publicEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    grade: employee.grade,
    targetGrade: employee.targetGrade,
    tenureMonths: employee.tenureMonths,
    readiness: employee.readiness,
    requirements: employee.requirements,
    recommendedActivityId: employee.recommendedActivityId,
    skills: Object.entries(employee.skills).map(([skillId, level]) => ({ skillId, name: SKILLS[skillId] || skillId, level, targetLevel: employee.targetSkillLevels?.[skillId] || Math.min(5, Number(level) + 1) }))
  };
}

function publicActivity(activity) {
  return { ...activity, skillName: SKILLS[activity.skillId] || activity.skillId };
}

function isActiveSeatStatus(status) {
  return ['enrolled', 'confirmed', 'in_progress', 'submitted', 'verified'].includes(status);
}

function sessionAvailability(store, session) {
  if (session.status !== 'scheduled') return session.status === 'cancelled' ? 'cancelled' : 'closed';
  const nowTime = Date.now();
  if (new Date(session.startsAt).getTime() <= nowTime || new Date(session.registrationDeadline).getTime() <= nowTime) return 'closed';
  const occupied = store.enrollments.filter(item => item.sessionId === session.id && isActiveSeatStatus(item.status)).length;
  return occupied >= session.capacity ? 'full' : 'open';
}

function publicSession(store, session, employeeId = null) {
  const occupiedSeats = store.enrollments.filter(item => item.sessionId === session.id && isActiveSeatStatus(item.status)).length;
  const employeeEnrollment = employeeId ? store.enrollments.find(item => item.sessionId === session.id && item.employeeId === employeeId && item.status !== 'cancelled') : null;
  return {
    id: session.id,
    activityId: session.activityId,
    status: session.status,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timezone: session.timezone,
    locationType: session.locationType,
    locationValue: session.locationValue,
    capacity: session.capacity,
    registrationDeadline: session.registrationDeadline,
    occupiedSeats,
    remainingSeats: Math.max(0, session.capacity - occupiedSeats),
    availability: sessionAvailability(store, session),
    employeeEnrollmentStatus: employeeEnrollment?.status || null
  };
}

function publicEnrollment(store, enrollment) {
  const session = enrollment.sessionId ? store.sessions.find(item => item.id === enrollment.sessionId) : null;
  const activity = store.activities.find(item => item.id === enrollment.activityId);
  return {
    ...enrollment,
    activity: activity ? publicActivity(activity) : null,
    session: session ? publicSession(store, session, enrollment.employeeId) : null
  };
}

function isEligible(employee, activity) {
  const eligibility = activity.eligibility || {};
  const roleAllowed = !eligibility.roles?.length || eligibility.roles.includes(employee.role);
  const gradeAllowed = !eligibility.grades?.length || eligibility.grades.includes(employee.grade);
  return roleAllowed && gradeAllowed;
}

function createCareerStore(filePath) {
  function getStore() { return readJson(filePath); }
  function save(store) { writeJson(filePath, store); }
  function getEmployee(store, id) {
    const employee = store.employees.find(item => item.id === id);
    if (!employee) throw new CareerStoreError('NOT_FOUND', 'Сотрудник не найден');
    return employee;
  }
  function getActivity(store, id) {
    const activity = store.activities.find(item => item.id === id);
    if (!activity) throw new CareerStoreError('NOT_FOUND', 'Активность не найдена');
    return activity;
  }
  function getSession(store, id) {
    const session = store.sessions.find(item => item.id === id);
    if (!session) throw new CareerStoreError('NOT_FOUND', 'Сессия мероприятия не найдена');
    return session;
  }
  function getActorFromStore(store, id) {
    const actor = store.users.find(item => item.id === id);
    if (!actor) throw new CareerStoreError('NOT_FOUND', 'Пользователь не найден');
    return actor;
  }

  return {
    getActor(actorId) {
      const actor = getActorFromStore(getStore(), actorId);
      return {
        id: actor.id,
        role: actor.role,
        employeeId: actor.employeeId || null,
        directReportEmployeeIds: actor.directReportEmployeeIds || []
      };
    },

    assertCanAccessEmployee(actor, employeeId) {
      if (!actor || !employeeId) throw new CareerStoreError('FORBIDDEN', 'Недостаточно прав для доступа к профилю');
      if (['hr', 'admin'].includes(actor.role)) return;
      if (actor.role === 'employee' && actor.employeeId === employeeId) return;
      if (actor.role === 'manager' && actor.directReportEmployeeIds.includes(employeeId)) return;
      throw new CareerStoreError('FORBIDDEN', 'Недостаточно прав для доступа к профилю');
    },

    assertCanManageActivities(actor) {
      if (!actor || !['hr', 'admin'].includes(actor.role)) {
        throw new CareerStoreError('FORBIDDEN', 'Недостаточно прав для управления активностями');
      }
    },

    getEnrollment(enrollmentId) {
      const enrollment = getStore().enrollments.find(item => item.id === enrollmentId);
      if (!enrollment) throw new CareerStoreError('NOT_FOUND', 'Запись не найдена');
      return enrollment;
    },

    getEnrollmentContext(enrollmentId) {
      const store = getStore();
      const enrollment = store.enrollments.find(item => item.id === enrollmentId);
      if (!enrollment) throw new CareerStoreError('NOT_FOUND', 'Запись не найдена');
      const activity = getActivity(store, enrollment.activityId);
      const session = enrollment.sessionId ? getSession(store, enrollment.sessionId) : null;
      return { enrollment, activity: publicActivity(activity), session: session ? publicSession(store, session, enrollment.employeeId) : null };
    },

    attachReminder(enrollmentId, reminderEnrollmentId) {
      const store = getStore();
      const enrollment = store.enrollments.find(item => item.id === enrollmentId);
      if (!enrollment) throw new CareerStoreError('NOT_FOUND', 'Запись не найдена');
      enrollment.reminderEnrollmentId = assertText(reminderEnrollmentId, 'reminderEnrollmentId', 128);
      enrollment.updatedAt = now();
      save(store);
      return enrollment;
    },

    getBootstrap(employeeId = 'E0028') {
      const store = getStore();
      const employee = getEmployee(store, employeeId);
      const activities = store.activities.filter(item => item.status === 'published' && isEligible(employee, item));
      const activityIds = new Set(activities.map(item => item.id));
      const sessions = store.sessions.filter(item => activityIds.has(item.activityId)).map(item => publicSession(store, item, employeeId));
      const enrollments = store.enrollments.filter(item => item.employeeId === employeeId).map(item => publicEnrollment(store, item));
      return {
        employee: publicEmployee(employee),
        activities: activities.map(publicActivity),
        sessions,
        enrollments,
        progressEvents: store.progressEvents.filter(item => item.employeeId === employeeId)
      };
    },

    listActivities(employeeId) {
      const store = getStore();
      const employee = getEmployee(store, employeeId);
      return store.activities.filter(item => item.status === 'published' && isEligible(employee, item)).map(publicActivity);
    },

    getActivityDetail(employeeId, activityId) {
      const store = getStore();
      const employee = getEmployee(store, employeeId);
      const activity = getActivity(store, activityId);
      if (activity.status !== 'published' || !isEligible(employee, activity)) {
        throw new CareerStoreError('FORBIDDEN', 'Активность недоступна для этого сотрудника');
      }
      return {
        activity: publicActivity(activity),
        sessions: store.sessions.filter(item => item.activityId === activity.id).map(item => publicSession(store, item, employeeId))
      };
    },

    listEnrollments(employeeId) {
      const store = getStore();
      getEmployee(store, employeeId);
      return store.enrollments.filter(item => item.employeeId === employeeId).map(item => publicEnrollment(store, item));
    },

    listAllActivities() {
      return getStore().activities;
    },

    createActivity(input) {
      assertObject(input, 'Тело запроса должно быть объектом');
      const store = getStore();
      const activity = {
        id: `ACT_${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        status: 'draft',
        title: assertText(input.title, 'title', 160),
        description: assertText(input.description, 'description', 2000),
        skillId: assertText(input.skillId, 'skillId', 80),
        skillImpact: assertPositiveInteger(input.skillImpact, 'skillImpact', 5),
        format: assertText(input.format, 'format', 80),
        durationHours: assertPositiveInteger(input.durationHours, 'durationHours', 2000),
        eligibility: assertEligibility(input.eligibility),
        createdAt: now(),
        updatedAt: now()
      };
      store.activities.push(activity);
      save(store);
      return activity;
    },

    updateActivity(activityId, input) {
      assertObject(input, 'Тело запроса должно быть объектом');
      const store = getStore();
      const activity = getActivity(store, activityId);
      const allowedStatuses = ['draft', 'published', 'archived'];
      if ('title' in input) activity.title = assertText(input.title, 'title', 160);
      if ('description' in input) activity.description = assertText(input.description, 'description', 2000);
      if ('skillId' in input) activity.skillId = assertText(input.skillId, 'skillId', 80);
      if ('skillImpact' in input) activity.skillImpact = assertPositiveInteger(input.skillImpact, 'skillImpact', 5);
      if ('format' in input) activity.format = assertText(input.format, 'format', 80);
      if ('durationHours' in input) activity.durationHours = assertPositiveInteger(input.durationHours, 'durationHours', 2000);
      if ('eligibility' in input) activity.eligibility = assertEligibility(input.eligibility);
      if ('status' in input) {
        if (!allowedStatuses.includes(input.status)) throw new CareerStoreError('VALIDATION_ERROR', 'Статус активности заполнен неверно');
        activity.status = input.status;
      }
      activity.updatedAt = now();
      save(store);
      return activity;
    },

    createEnrollment(input) {
      assertObject(input, 'Тело запроса должно быть объектом');
      const employeeId = assertText(input.employeeId, 'employeeId', 64);
      const activityId = assertText(input.activityId, 'activityId', 64);
      const store = getStore();
      const employee = getEmployee(store, employeeId);
      const activity = getActivity(store, activityId);
      if (activity.status !== 'published') throw new CareerStoreError('CONFLICT', 'Активность недоступна для записи');
      if (!isEligible(employee, activity)) throw new CareerStoreError('FORBIDDEN', 'Активность недоступна для этого сотрудника');
      const session = input.sessionId
        ? getSession(store, assertText(input.sessionId, 'sessionId', 80))
        : store.sessions.find(item => item.activityId === activityId && sessionAvailability(store, item) === 'open');
      if (!session || session.activityId !== activityId) throw new CareerStoreError('CONFLICT', 'Выберите доступную сессию мероприятия');
      const availability = sessionAvailability(store, session);
      if (!['open', 'full'].includes(availability)) throw new CareerStoreError('CONFLICT', 'Регистрация на эту сессию закрыта');
      const duplicate = store.enrollments.find(item => item.employeeId === employeeId && item.sessionId === session.id && ['enrolled', 'waitlisted', 'confirmed', 'in_progress', 'submitted', 'verified'].includes(item.status));
      if (duplicate) throw new CareerStoreError('CONFLICT', 'Сотрудник уже записан на эту сессию');
      const enrollment = {
        id: crypto.randomUUID(), employeeId, activityId, sessionId: session.id, status: availability === 'full' ? 'waitlisted' : 'enrolled', evidence: null,
        reminderEnrollmentId: null,
        createdAt: now(), updatedAt: now()
      };
      store.enrollments.push(enrollment);
      save(store);
      return publicEnrollment(store, enrollment);
    },

    cancelEnrollment(enrollmentId) {
      const store = getStore();
      const enrollment = store.enrollments.find(item => item.id === enrollmentId);
      if (!enrollment) throw new CareerStoreError('NOT_FOUND', 'Запись не найдена');
      if (!['enrolled', 'waitlisted', 'confirmed'].includes(enrollment.status)) throw new CareerStoreError('CONFLICT', 'Запись нельзя отменить в текущем статусе');
      const session = enrollment.sessionId ? getSession(store, enrollment.sessionId) : null;
      if (!session || new Date(session.startsAt).getTime() <= Date.now()) throw new CareerStoreError('CONFLICT', 'После начала сессии отмена недоступна');
      enrollment.status = 'cancelled';
      enrollment.cancelledAt = now();
      enrollment.updatedAt = enrollment.cancelledAt;
      const promoted = store.enrollments
        .filter(item => item.sessionId === enrollment.sessionId && item.status === 'waitlisted')
        .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0];
      if (promoted) {
        promoted.status = 'enrolled';
        promoted.promotedAt = now();
        promoted.updatedAt = promoted.promotedAt;
      }
      save(store);
      return { enrollment: publicEnrollment(store, enrollment), promotedEnrollment: promoted ? publicEnrollment(store, promoted) : null };
    },

    submitEvidence(enrollmentId, input) {
      assertObject(input, 'Тело запроса должно быть объектом');
      const evidence = assertText(input.evidence, 'evidence', 2000);
      const store = getStore();
      const enrollment = store.enrollments.find(item => item.id === enrollmentId);
      if (!enrollment) throw new CareerStoreError('NOT_FOUND', 'Запись не найдена');
      if (!['enrolled', 'in_progress'].includes(enrollment.status)) throw new CareerStoreError('CONFLICT', 'Evidence нельзя отправить в текущем статусе');
      enrollment.status = 'submitted';
      enrollment.evidence = evidence;
      enrollment.submittedAt = now();
      enrollment.updatedAt = enrollment.submittedAt;
      save(store);
      return enrollment;
    }
  };
}

module.exports = { CareerStoreError, createCareerStore, seedStore };
