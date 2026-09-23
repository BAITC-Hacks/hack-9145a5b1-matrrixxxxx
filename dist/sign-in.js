(() => {
  'use strict';
  const identities = {
    employee: { actorId: 'U_EMPLOYEE_E0028', role: 'employee', employeeId: 'E0028', name: 'Алия Нуржанова', initials: 'АН', home: '/app/home' },
    manager: { actorId: 'U_MANAGER_BACKEND', role: 'manager', name: 'Backend team', initials: 'BT', home: '/manager/team' },
    hr: { actorId: 'U_HR_DEVELOPMENT', role: 'hr', name: 'HR Development', initials: 'HR', home: '/hr/overview' },
    admin: { actorId: 'U_ADMIN_PLATFORM', role: 'admin', name: 'Администратор', initials: 'АД', home: '/admin/overview' }
  };
  const next = new URLSearchParams(window.location.search).get('next');
  const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null;
  document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', () => {
    const identity = identities[button.dataset.demoRole];
    if (!identity) return;
    window.localStorage.setItem('careerQuestDemoSession', JSON.stringify({ ...identity, issuedAt: new Date().toISOString() }));
    window.location.assign(safeNext || identity.home);
  }));
})();
