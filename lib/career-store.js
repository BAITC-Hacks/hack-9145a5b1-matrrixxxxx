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
  SK_LEADERSHIP: 'Leadership'
};

function now() { return new Date().toISOString(); }

function seedStore() {
  const createdAt = now();
  return {
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    employees: [
      {
        id: 'E0028', name: 'Алия Нуржанова', role: 'Backend Engineer', grade: 'Middle', targetGrade: 'Senior', tenureMonths: 52,
        skills: { SK_SYSTEM_DESIGN: 2, SK_PYTHON: 3, SK_PUBLIC_SPEAKING: 2 }
      },
      {
        id: 'E0114', name: 'Данияр Сагинов', role: 'Data Analyst', grade: 'Junior', targetGrade: 'Middle', tenureMonths: 18,
        skills: { SK_SQL: 3, SK_DATA_STORYTELLING: 1, SK_PYTHON: 2 }
      },
      {
        id: 'E0192', name: 'Айгерим Касымова', role: 'Product Manager', grade: 'Middle', targetGrade: 'Senior', tenureMonths: 39,
        skills: { SK_LEADERSHIP: 2, SK_PUBLIC_SPEAKING: 3, SK_PYTHON: 4 }
      }
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

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return seedStore();
  try {
    const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assertObject(store, 'Хранилище повреждено');
    for (const key of ['employees', 'activities', 'enrollments', 'progressEvents']) {
      if (!Array.isArray(store[key])) throw new CareerStoreError('STORE_CORRUPTED', 'Хранилище имеет неверную структуру');
    }
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
    skills: Object.entries(employee.skills).map(([skillId, level]) => ({ skillId, name: SKILLS[skillId] || skillId, level }))
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

  return {
    getBootstrap(employeeId = 'E0028') {
      const store = getStore();
      const employee = getEmployee(store, employeeId);
      const enrollments = store.enrollments.filter(item => item.employeeId === employeeId);
      return {
        employee: publicEmployee(employee),
        activities: store.activities.filter(item => item.status === 'published' && isEligible(employee, item)),
        enrollments,
        progressEvents: store.progressEvents.filter(item => item.employeeId === employeeId)
      };
    },

    listActivities(employeeId) {
      const store = getStore();
      const employee = getEmployee(store, employeeId);
      return store.activities.filter(item => item.status === 'published' && isEligible(employee, item));
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
      const duplicate = store.enrollments.find(item => item.employeeId === employeeId && item.activityId === activityId && ['enrolled', 'in_progress', 'submitted', 'verified'].includes(item.status));
      if (duplicate) throw new CareerStoreError('CONFLICT', 'Сотрудник уже записан на эту активность');
      const enrollment = {
        id: crypto.randomUUID(), employeeId, activityId, status: 'enrolled', evidence: null,
        createdAt: now(), updatedAt: now()
      };
      store.enrollments.push(enrollment);
      save(store);
      return enrollment;
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
