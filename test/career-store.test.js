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
