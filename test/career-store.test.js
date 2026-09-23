const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CareerStoreError, createCareerStore } = require('../lib/career-store');

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quest-'));
  const file = path.join(directory, 'career-store.json');
  try { run(createCareerStore(file)); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('bootstrap returns an employee and only eligible published activities', () => withStore(store => {
  const result = store.getBootstrap('E0028');
  assert.equal(result.employee.name, 'Алия Нуржанова');
  assert.deepEqual(result.activities.map(item => item.id), ['ACT_SYSTEM_DESIGN_LAB']);
}));

test('enrollment is persisted and duplicate enrollment is rejected', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB' });
  assert.equal(enrollment.status, 'enrolled');
  assert.throws(() => store.createEnrollment({ employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB' }), error => error instanceof CareerStoreError && error.code === 'CONFLICT');
}));

test('employee cannot enroll in an activity outside eligibility', () => withStore(store => {
  assert.throws(() => store.createEnrollment({ employeeId: 'E0028', activityId: 'ACT_DATA_STORYTELLING_LAB' }), error => error instanceof CareerStoreError && error.code === 'FORBIDDEN');
}));

test('evidence moves an enrollment to submitted once', () => withStore(store => {
  const enrollment = store.createEnrollment({ employeeId: 'E0028', activityId: 'ACT_SYSTEM_DESIGN_LAB' });
  const submitted = store.submitEvidence(enrollment.id, { evidence: 'Ссылка на архитектурный разбор задачи CQ-42' });
  assert.equal(submitted.status, 'submitted');
  assert.throws(() => store.submitEvidence(enrollment.id, { evidence: 'Повторная отправка' }), error => error instanceof CareerStoreError && error.code === 'CONFLICT');
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
