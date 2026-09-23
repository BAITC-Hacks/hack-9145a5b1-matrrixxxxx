const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CareerStoreError, createCareerStore, seedStore } = require('../lib/career-store');

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quest-'));
  const file = path.join(directory, 'career-store.json');
  try { run(createCareerStore(file)); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function withFixture(mutate, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quest-fixture-'));
  const file = path.join(directory, 'career-store.json');
  try {
    const fixture = seedStore();
    mutate(fixture);
    fs.writeFileSync(file, JSON.stringify(fixture));
    run(createCareerStore(file));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('bootstrap returns an employee and only eligible published activities', () => withStore(store => {
  const result = store.getBootstrap('E0028');
  assert.equal(result.employee.name, 'Алия Нуржанова');
  assert.deepEqual(result.activities.map(item => item.id), ['ACT_SYSTEM_DESIGN_LAB']);
  assert.equal(result.sessions[0].activityId, 'ACT_SYSTEM_DESIGN_LAB');
  assert.equal(result.sessions[0].availability, 'open');
}));

test('enrollment is persisted and duplicate enrollment is rejected', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT', activityId: 'forged-activity-id' });
  assert.equal(enrollment.status, 'enrolled');
  assert.equal(enrollment.activityId, 'ACT_SYSTEM_DESIGN_LAB');
  assert.throws(() => store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' }), error => error instanceof CareerStoreError && error.code === 'CONFLICT');
}));

test('employee cannot enroll in an activity outside eligibility', () => withStore(store => {
  assert.throws(() => store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_DATA_STORYTELLING_OCT' }), error => error instanceof CareerStoreError && error.code === 'FORBIDDEN');
}));

test('evidence moves an enrollment to submitted once', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  const submitted = store.submitEvidence(enrollment.id, { evidence: 'Ссылка на архитектурный разбор задачи CQ-42' });
  assert.equal(submitted.status, 'submitted');
  assert.throws(() => store.submitEvidence(enrollment.id, { evidence: 'Повторная отправка' }), error => error instanceof CareerStoreError && error.code === 'CONFLICT');
}));

test('a Telegram-confirmed participant can still submit evidence', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  assert.equal(store.confirmEnrollment(enrollment.id).status, 'confirmed');
  assert.equal(store.submitEvidence(enrollment.id, { evidence: 'Подтверждённое участие и результат практикума CQ-42' }).status, 'submitted');
}));

test('a reminder record can be linked to the persisted enrollment', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  const linked = store.attachReminder(enrollment.id, 'REMINDER-123');
  assert.equal(linked.reminderEnrollmentId, 'REMINDER-123');
}));

test('a full session puts the next eligible employee on waitlist and promotes them after cancellation', () => withFixture(fixture => {
  const session = fixture.sessions.find(item => item.id === 'SES_SYSTEM_DESIGN_OCT');
  session.capacity = 1;
  fixture.employees.push({
    id: 'E_TEST_BACKEND', name: 'Тестовый Инженер', role: 'Backend Engineer', grade: 'Middle', targetGrade: 'Senior', tenureMonths: 12,
    readiness: 50, requirements: 'Тестовый профиль', recommendedActivityId: 'ACT_SYSTEM_DESIGN_LAB',
    targetSkillLevels: { SK_SYSTEM_DESIGN: 4 }, skills: { SK_SYSTEM_DESIGN: 1 }
  });
  fixture.users.push({ id: 'U_EMPLOYEE_E_TEST_BACKEND', role: 'employee', employeeId: 'E_TEST_BACKEND' });
}, store => {
  const seatHolder = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  const waiting = store.createEnrollment({ employeeId: 'E_TEST_BACKEND', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  assert.equal(waiting.status, 'waitlisted');
  assert.equal(store.getBootstrap('E0028').sessions[0].remainingSeats, 0);
  const cancelled = store.cancelEnrollment(seatHolder.id);
  assert.equal(cancelled.enrollment.status, 'cancelled');
  assert.equal(cancelled.promotedEnrollment.id, waiting.id);
  assert.equal(cancelled.promotedEnrollment.status, 'enrolled');
  assert.equal(store.cancelEnrollment(seatHolder.id).promotedEnrollment, null);
}));

test('legacy activity-only enrollment never consumes a future session seat', () => withFixture(fixture => {
  fixture.enrollments.push({
    id: 'EN_LEGACY', employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB', status: 'enrolled', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
}, store => {
  const data = store.getBootstrap('E0028');
  assert.equal(data.enrollments.find(item => item.id === 'EN_LEGACY').session, null);
  assert.equal(data.sessions[0].occupiedSeats, 0);
}));

test('cancellation observes the server-owned deadline', () => withFixture(fixture => {
  fixture.sessions.find(item => item.id === 'SES_SYSTEM_DESIGN_OCT').cancellationDeadline = '2020-01-01T00:00:00.000Z';
}, store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  assert.throws(() => store.cancelEnrollment(enrollment.id), error => error instanceof CareerStoreError && error.code === 'CONFLICT');
}));

test('development roles can access only the profiles permitted to them', () => withStore(store => {
  const employee = store.getActor('U_EMPLOYEE_E0028');
  const manager = store.getActor('U_MANAGER_BACKEND');
  const hr = store.getActor('U_HR_DEVELOPMENT');
  assert.doesNotThrow(() => store.assertCanAccessEmployee(employee, 'E0028'));
  assert.throws(() => store.assertCanAccessEmployee(employee, 'E0114'), error => error instanceof CareerStoreError && error.code === 'FORBIDDEN');
  assert.doesNotThrow(() => store.assertCanAccessEmployee(manager, 'E0028'));
  assert.doesNotThrow(() => store.assertCanAccessEmployee(hr, 'E0114'));
}));

test('only HR can create and publish an activity', () => withStore(store => {
  const hr = store.getActor('U_HR_DEVELOPMENT');
  const employee = store.getActor('U_EMPLOYEE_E0028');
  assert.throws(() => store.assertCanManageActivities(employee), error => error instanceof CareerStoreError && error.code === 'FORBIDDEN');
  assert.doesNotThrow(() => store.assertCanManageActivities(hr));
  const activity = store.createActivity({
    title: 'Cloud Architecture Lab', description: 'Практический workshop.', skillId: 'SK_CLOUD_ARCHITECTURE', skillImpact: 1,
    format: 'Workshop', durationHours: 6, eligibility: { roles: ['Backend Engineer'], grades: ['Middle'] }
  });
  assert.equal(activity.status, 'draft');
  assert.equal(store.updateActivity(activity.id, { status: 'published' }).status, 'published');
}));

test('a manager sees only direct-report evidence and can request a revision', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  store.submitEvidence(enrollment.id, { evidence: 'Архитектурный разбор CQ-42 и ссылка на pull request' });
  const manager = store.getActor('U_MANAGER_BACKEND');
  const employee = store.getActor('U_EMPLOYEE_E0028');
  assert.equal(store.listReviewQueue(manager).length, 1);
  assert.throws(() => store.listReviewQueue(employee), error => error instanceof CareerStoreError && error.code === 'FORBIDDEN');
  const result = store.reviewEnrollment(enrollment.id, manager, { decision: 'revision', comment: 'Добавьте описание компромиссов и повторно отправьте результат.' });
  assert.equal(result.enrollment.status, 'revision');
  assert.equal(result.progressEvent, null);
  assert.equal(store.listReviewQueue(manager).length, 0);
}));

test('HR verification records an immutable progress event and improves the target skill', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', sessionId: 'SES_SYSTEM_DESIGN_OCT' });
  store.submitEvidence(enrollment.id, { evidence: 'Архитектурный разбор CQ-42 и ссылка на pull request' });
  const before = store.getBootstrap('E0028').employee;
  const result = store.reviewEnrollment(enrollment.id, store.getActor('U_HR_DEVELOPMENT'), {
    decision: 'verified', comment: 'Хорошо раскрыты компромиссы и сценарий масштабирования.'
  });
  const after = store.getBootstrap('E0028');
  assert.equal(result.enrollment.status, 'verified');
  assert.equal(result.progressEvent.type, 'activity_verified');
  assert.equal(after.employee.skills.find(item => item.skillId === 'SK_SYSTEM_DESIGN').level, 3);
  assert.ok(after.employee.readiness > before.readiness);
  assert.equal(after.progressEvents.length, 1);
  assert.throws(() => store.reviewEnrollment(enrollment.id, store.getActor('U_HR_DEVELOPMENT'), {
    decision: 'verified', comment: 'Повторная проверка невозможна.'
  }), error => error instanceof CareerStoreError && error.code === 'CONFLICT');
}));
