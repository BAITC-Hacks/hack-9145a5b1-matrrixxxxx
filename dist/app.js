(() => {
  'use strict';

  const SESSION_KEY = 'careerQuestDemoSession';
  const actors = Object.freeze({
    employee: { actorId: 'U_EMPLOYEE_E0028', role: 'employee', employeeId: 'E0028', name: 'Алия Нуржанова', initials: 'АН', home: '/app/home', label: 'Сотрудник' },
    manager: { actorId: 'U_MANAGER_BACKEND', role: 'manager', name: 'Backend team', initials: 'BT', home: '/manager/team', label: 'Руководитель' },
    hr: { actorId: 'U_HR_DEVELOPMENT', role: 'hr', name: 'HR Development', initials: 'HR', home: '/hr/overview', label: 'HR' },
    admin: { actorId: 'U_ADMIN_PLATFORM', role: 'admin', name: 'Администратор', initials: 'АД', home: '/admin/overview', label: 'Администратор' }
  });
  const fallback = Object.freeze({
    employee: { id: 'E0028', name: 'Алия Нуржанова', role: 'Backend Engineer', grade: 'Middle', targetGrade: 'Senior', tenureMonths: 52, readiness: 68, requirements: '5 из 7 требований уже закрыты', recommendedActivityId: 'ACT_SYSTEM_DESIGN_LAB', skills: [{ skillId: 'SK_SYSTEM_DESIGN', name: 'System Design', level: 2, targetLevel: 4 }, { skillId: 'SK_PYTHON', name: 'Python', level: 3, targetLevel: 4 }, { skillId: 'SK_PUBLIC_SPEAKING', name: 'Public Speaking', level: 2, targetLevel: 2 }] },
    activities: [{ id: 'ACT_SYSTEM_DESIGN_LAB', status: 'published', title: 'System Design: от схемы к решению', description: 'Практикум по проектированию устойчивых сервисов.', skillId: 'SK_SYSTEM_DESIGN', skillName: 'System Design', skillImpact: 1, format: 'Практикум', durationHours: 6, eligibility: { roles: ['Backend Engineer'], grades: ['Middle', 'Senior'] } }, { id: 'ACT_DATA_STORYTELLING_LAB', status: 'published', title: 'Data Storytelling Lab', description: 'Практика построения убедительной истории на основе данных.', skillId: 'SK_DATA_STORYTELLING', skillName: 'Data Storytelling', skillImpact: 1, format: 'Практика', durationHours: 4, eligibility: { roles: ['Data Analyst'], grades: ['Junior', 'Middle'] } }, { id: 'ACT_LEADERSHIP_PRACTICE', status: 'published', title: 'Leadership через практику', description: 'Кросс-функциональный проект с регулярной обратной связью.', skillId: 'SK_LEADERSHIP', skillName: 'Leadership', skillImpact: 1, format: 'Проект', durationHours: 8, eligibility: { roles: ['Product Manager'], grades: ['Middle', 'Senior'] } }]
  });
  const roleNavigation = Object.freeze({
    employee: [
      ['Мой план', '/app/home', '⌂'], ['Каталог', '/app/catalog', '▦'], ['Мои записи', '/app/enrollments', '◷'], ['Маршрут', '/app/development-plan', '↗'], ['Уведомления', '/app/notifications', '◌'], ['Профиль', '/app/profile', '◉']
    ],
    manager: [['Моя команда', '/manager/team', '◎'], ['Очередь review', '/manager/reviews', '✓']],
    hr: [['Обзор', '/hr/overview', '▤'], ['Активности', '/hr/activities', '▦'], ['Аналитика', '/hr/analytics', '◫']],
    admin: [['Состояние системы', '/admin/overview', '⚙']]
  });
  const routeMeta = Object.freeze({
    '/app/home': { role: 'employee', kind: 'employee-home', title: 'Мой план развития', eyebrow: 'Персональный маршрут', description: 'Сфокусируйтесь на одном следующем действии — мы покажем контекст, а не просто список задач.' },
    '/app/catalog': { role: 'employee', kind: 'employee-catalog', title: 'Каталог активностей', eyebrow: 'Подходящие возможности', description: 'Здесь появятся сессии, время, места и доступность. Сейчас показан foundation-каталог.' },
    '/app/enrollments': { role: 'employee', kind: 'employee-enrollments', title: 'Мои записи', eyebrow: 'Learning hub', description: 'Ближайшие активности, статусы прохождения и evidence будут собраны в одном месте.' },
    '/app/development-plan': { role: 'employee', kind: 'employee-plan', title: 'Мой карьерный маршрут', eyebrow: 'Навыки и цель', description: 'Развитие строится вокруг требований следующего грейда и проверяемых результатов.' },
    '/app/notifications': { role: 'employee', kind: 'employee-notifications', title: 'Уведомления', eyebrow: 'Ваши настройки', description: 'Вы управляете подключением Telegram и будущими каналами напоминаний.' },
    '/app/profile': { role: 'employee', kind: 'employee-profile', title: 'Мой профиль', eyebrow: 'Корпоративные данные', description: 'Отображаем только те данные, которые нужны для карьерного маршрута.' },
    '/manager/team': { role: 'manager', kind: 'manager-team', title: 'Моя команда', eyebrow: 'Руководитель', description: 'Поддерживайте развитие прямых подчинённых без публичного ранжирования.' },
    '/manager/reviews': { role: 'manager', kind: 'manager-reviews', title: 'Очередь review', eyebrow: 'Проверка evidence', description: 'Здесь появятся результаты, ожидающие содержательной обратной связи.' },
    '/hr/overview': { role: 'hr', kind: 'hr-overview', title: 'Программа развития', eyebrow: 'HR overview', description: 'Смотрите охват и дефициты компетенций, сохраняя фокус на программе, а не на рейтингах людей.' },
    '/hr/activities': { role: 'hr', kind: 'hr-activities', title: 'Каталог HR', eyebrow: 'Управление активностями', description: 'Черновики, публикация и архив — в одном управляемом потоке.' },
    '/hr/analytics': { role: 'hr', kind: 'hr-analytics', title: 'Аналитика развития', eyebrow: 'Агрегированные данные', description: 'Перед включением детальных срезов будут добавлены пороги приватности и безопасный экспорт.' },
    '/admin/overview': { role: 'admin', kind: 'admin-overview', title: 'Состояние системы', eyebrow: 'Администрирование', description: 'Интеграции, роли и журнал важных действий станут управляемыми из этого пространства.' }
  });

  const root = document.getElementById('career-quest-app');
  const currentPath = normalizePath(window.location.pathname);
  const session = getSession();
  if (!session) {
    window.location.replace(`/sign-in?next=${encodeURIComponent(currentPath)}`);
    return;
  }
  const route = routeMeta[currentPath];
  if (!route) {
    renderGuard({ title: 'Страница не найдена', message: 'Такого раздела пока нет или ссылка устарела.', action: session.home, actionLabel: 'Вернуться в рабочее пространство', code: '404' });
    return;
  }
  if (route.role !== session.role) {
    renderGuard({ title: 'Недостаточно прав', message: 'Этот раздел доступен другой корпоративной роли. Доступ в demo-контуре не заменяет настоящую авторизацию.', action: session.home, actionLabel: 'Вернуться к моему пространству', code: '403' });
    return;
  }
  renderShell();

  function normalizePath(pathname) {
    const value = String(pathname || '/').replace(/\/+$/, '');
    return value || '/';
  }
  function getSession() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
      if (!value || !actors[value.role] || actors[value.role].actorId !== value.actorId) return null;
      return { ...actors[value.role], ...value };
    } catch { return null; }
  }
  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function link(label, href, className = 'cq-button cq-button--quiet') {
    const node = create('a', className, label); node.href = href; return node;
  }
  function status(label, type = 'neutral') { return create('span', `cq-status cq-status--${type}`, label); }
  function card(className = 'cq-card cq-card--pad') { return create('article', className); }
  function icon(value) { return create('span', 'cq-nav-icon', value); }
  function initials(value) { return String(value || '').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'CQ'; }
  function append(parent, ...nodes) { nodes.filter(Boolean).forEach(node => parent.append(node)); return parent; }
  function pageHeader(meta, actions = []) {
    const head = create('header', 'cq-page-head'); const copy = create('div');
    append(copy, create('p', 'cq-eyebrow', meta.eyebrow), create('h1', '', meta.title), create('p', '', meta.description));
    const actionWrap = create('div', 'cq-page-actions'); actions.forEach(action => actionWrap.append(action));
    append(head, copy, actionWrap); return head;
  }
  function showSourceNotice(error) {
    const alert = create('div', 'cq-alert'); const copy = create('div');
    append(copy, create('strong', '', 'Показаны demo-данные'), create('p', '', 'Локальный API недоступен или development access выключен. Интерфейс остаётся доступным для проверки layout и сценариев.'));
    append(alert, create('span', '', 'i'), copy);
    if (error) alert.title = error.message || String(error);
    return alert;
  }
  function emptyState(title, message, href, label) {
    const view = create('section', 'cq-empty'); append(view, create('div', 'cq-empty-icon', '○'), create('h2', '', title), create('p', '', message));
    if (href && label) view.append(link(label, href, 'cq-button cq-button--dark')); return view;
  }
  function errorState(error) {
    const view = create('section', 'cq-error'); append(view, create('div', 'cq-empty-icon', '!'), create('h2', '', 'Не удалось загрузить раздел'), create('p', '', error.message || 'Попробуйте обновить страницу.'));
    const retry = create('button', 'cq-button cq-button--dark', 'Повторить'); retry.type = 'button'; retry.addEventListener('click', renderPage); view.append(retry); return view;
  }
  async function api(path) {
    const response = await fetch(path, { headers: { 'x-career-quest-actor': session.actorId } });
    let payload = null; try { payload = await response.json(); } catch { /* response is handled below */ }
    if (!response.ok) throw new Error(payload?.error || `Сервис ответил кодом ${response.status}`);
    return payload;
  }
  async function bootstrap(employeeId = session.employeeId || 'E0028') {
    try { return { ...(await api(`/api/v1/bootstrap?employeeId=${encodeURIComponent(employeeId)}`)), source: 'api' }; }
    catch (error) { return { employee: fallback.employee, activities: fallback.activities, enrollments: [], progressEvents: [], source: 'fallback', error }; }
  }
  function renderGuard({ title, message, action, actionLabel, code }) {
    document.body.className = '';
    const section = create('main', 'cq-guard cq-card'); section.id = 'main-content';
    append(section, status('Ошибка ' + code, 'danger'), create('h1', '', title), create('p', '', message), link(actionLabel, action, 'cq-button cq-button--dark'));
    root.replaceChildren(section);
  }
  function renderShell() {
    const shell = create('div', 'cq-app');
    const sidebar = create('aside', 'cq-sidebar');
    const brand = link('', '/app/home', 'cq-brand'); brand.setAttribute('aria-label', 'Career Quest — рабочее пространство');
    const mark = create('span', 'cq-brand-mark'); mark.setAttribute('aria-hidden', 'true'); mark.textContent = '✓'; append(brand, mark, create('span', '', 'Career Quest'));
    const nav = create('nav', 'cq-nav'); nav.setAttribute('aria-label', 'Разделы рабочего пространства');
    roleNavigation[session.role].forEach(([label, href, glyph]) => {
      const item = create('a', '', label); item.href = href; if (href === currentPath) item.setAttribute('aria-current', 'page'); item.prepend(icon(glyph)); nav.append(item);
    });
    const environment = create('div', 'cq-environment', 'Demo-контур · mock access');
    const userWrap = create('div', 'cq-sidebar-bottom'); const user = create('button', 'cq-user-button'); user.type = 'button'; user.setAttribute('aria-label', 'Выйти из demo-контура');
    append(user, create('span', 'cq-avatar', session.initials || initials(session.name)), create('span', '', ''), create('span', '', '↗'));
    const userCopy = user.querySelectorAll('span')[1]; append(userCopy, create('strong', '', session.name), create('span', '', session.label));
    user.addEventListener('click', () => { window.localStorage.removeItem(SESSION_KEY); window.location.assign('/sign-in'); }); userWrap.append(user);
    append(sidebar, brand, environment, create('p', 'cq-nav-label', session.label), nav, userWrap);

    const main = create('div', 'cq-app-main'); const top = create('header', 'cq-topbar');
    const mobileBrand = create('span', 'cq-mobile-brand'); const mobileMark = create('span', 'cq-brand-mark', '✓'); mobileMark.setAttribute('aria-hidden', 'true'); append(mobileBrand, mobileMark, create('span', '', 'Career Quest'));
    const crumb = create('span', 'cq-topbar-crumb', route.eyebrow);
    const actions = create('div', 'cq-topbar-actions'); const legacy = link('Открыть MVP', '/legacy-demo', 'cq-button cq-button--quiet'); legacy.title = 'Предыдущий единый demo-dashboard'; actions.append(legacy);
    append(top, mobileBrand, crumb, actions); const content = create('main', 'cq-page'); content.id = 'main-content'; append(main, top, content); append(shell, sidebar, main); root.replaceChildren(shell);
    renderPage();
  }
  async function renderPage() {
    const content = document.getElementById('main-content'); if (!content) return;
    const meta = routeMeta[normalizePath(window.location.pathname)]; if (!meta) return;
    content.replaceChildren(pageHeader(meta), create('div', 'cq-skeleton'), create('div', 'cq-skeleton'));
    try {
      const view = await renderByKind(meta.kind);
      content.replaceChildren(pageHeader(meta, headerActions(meta.kind)), view);
    } catch (error) { content.replaceChildren(pageHeader(meta), errorState(error)); }
  }
  function headerActions(kind) {
    if (kind === 'employee-catalog') return [link('Мои записи', '/app/enrollments', 'cq-button cq-button--dark')];
    if (kind === 'employee-home') return [link('Каталог активностей', '/app/catalog', 'cq-button cq-button--dark')];
    if (kind === 'hr-activities') return [link('Создать activity', '/hr/activities', 'cq-button cq-button--dark')];
    return [];
  }
  async function renderByKind(kind) {
    switch (kind) {
      case 'employee-home': return renderEmployeeHome();
      case 'employee-catalog': return renderCatalog();
      case 'employee-enrollments': return renderEnrollments();
      case 'employee-plan': return renderDevelopmentPlan();
      case 'employee-notifications': return renderNotifications();
      case 'employee-profile': return renderProfile();
      case 'manager-team': return renderManagerTeam();
      case 'manager-reviews': return renderReviews();
      case 'hr-overview': return renderHrOverview();
      case 'hr-activities': return renderHrActivities();
      case 'hr-analytics': return renderHrAnalytics();
      case 'admin-overview': return renderAdminOverview();
      default: return emptyState('Раздел готовится', 'Функциональность будет добавлена в следующей задаче.', session.home, 'Вернуться');
    }
  }
  function activityCard(activity) {
    const item = card('cq-card cq-activity'); const top = create('div', 'cq-activity-top');
    append(top, status(activity.status === 'published' ? 'Доступно' : activity.status === 'draft' ? 'Черновик' : 'Архив', activity.status === 'published' ? 'success' : 'neutral'), create('span', 'cq-list-meta', `${activity.durationHours} ч`));
    append(item, top, create('h3', '', activity.title), create('p', '', activity.description || 'Описание будет добавлено организатором.'));
    const footer = create('div', 'cq-activity-footer'); append(footer, create('span', '', `${activity.skillName || activity.skillId} +${activity.skillImpact || 1}`), create('span', '', activity.format || 'Активность')); item.append(footer); return item;
  }
  function skillRows(skills) {
    const list = create('div'); (skills || []).forEach(skill => {
      const row = create('div', 'cq-skill-row'); const target = Math.max(1, Number(skill.targetLevel) || 1); const level = Math.max(0, Number(skill.level) || 0);
      const progress = create('div', 'cq-progress'); const bar = create('i'); bar.style.width = `${Math.min(100, level / target * 100)}%`; progress.append(bar);
      append(row, create('strong', '', skill.name || skill.skillId), create('span', '', `${level} / ${target}`), progress); list.append(row);
    }); return list;
  }
  async function renderEmployeeHome() {
    const data = await bootstrap(); const employee = data.employee; const recommended = (data.activities || []).find(item => item.id === employee.recommendedActivityId) || data.activities?.[0];
    const view = create('div', 'cq-grid'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const grid = create('div', 'cq-grid cq-grid--two'); const action = card('cq-next-action');
    append(action, create('p', 'cq-eyebrow', 'Ваш следующий сильный шаг'), create('h2', '', recommended?.title || 'Выберите следующую активность'), create('p', '', recommended ? `Навык ${recommended.skillName || recommended.skillId} — ключевой разрыв для цели ${employee.targetGrade}. В Task 2 здесь появится выбор конкретной сессии.` : 'Когда HR опубликует подходящую активность, она появится в этой карточке.'));
    const facts = create('div', 'cq-action-facts'); if (recommended) append(facts, create('span', '', `${recommended.format} · ${recommended.durationHours} ч`), create('span', '', `${recommended.skillName || recommended.skillId} +${recommended.skillImpact || 1}`)); action.append(facts);
    const footer = create('div', 'cq-action-footer'); append(footer, status('Рекомендация объяснима', 'success'), link('Открыть каталог', '/app/catalog', 'cq-button')); action.append(footer);
    const score = card('cq-card cq-card--pad cq-score-card'); const ring = create('div', 'cq-score-ring'); ring.style.setProperty('--score', String(employee.readiness || 0)); append(ring, create('strong', '', `${employee.readiness || 0}%`), create('span', '', 'готовность'));
    const scoreCopy = create('div'); append(scoreCopy, create('h3', '', `Цель: ${employee.targetGrade}`), create('p', '', employee.requirements || 'Профиль собирается')); append(score, ring, scoreCopy); append(grid, action, score); view.append(grid);
    const lower = create('div', 'cq-grid cq-grid--two'); const skills = card(); append(skills, create('div', 'cq-card-head'), skillRows(employee.skills)); const skillHead = skills.querySelector('.cq-card-head'); append(skillHead, create('div', '', ''), status('Ключевые навыки', 'neutral')); skillHead.firstChild.append(create('h2', '', 'Куда направить усилия'), create('p', '', 'Уровень и требования следующего грейда.'));
    const next = card(); const nextHead = create('div', 'cq-card-head'); append(nextHead, create('div', '', ''), status('Следующее действие', 'warning')); nextHead.firstChild.append(create('h2', '', 'Ваш learning hub'), create('p', '', 'Записи и evidence собраны по понятным статусам.')); next.append(nextHead);
    const list = create('div', 'cq-list'); const item = create('div', 'cq-list-item'); append(item, create('span', 'cq-list-icon', '◷'), create('div', 'cq-list-copy', ''), create('span', 'cq-list-meta', 'Task 2')); const copy = item.querySelector('.cq-list-copy'); append(copy, create('strong', '', data.enrollments?.length ? 'Есть активные записи' : 'Пока нет записей'), create('span', '', data.enrollments?.length ? 'Откройте My learning для статусов.' : 'Выберите сессию в каталоге, когда она будет опубликована.')); list.append(item); next.append(list); lower.append(skills, next); view.append(lower); return view;
  }
  async function renderCatalog() {
    const data = await bootstrap(); const view = create('div', 'cq-grid'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const note = create('div', 'cq-alert'); append(note, create('span', '', 'i'), create('div', '', '')); const copy = note.lastChild; append(copy, create('strong', '', 'Foundation-каталог'), create('p', '', 'В следующей задаче каждая activity получит опубликованные сессии, дату, часовой пояс, место и вместимость. Сотрудник не будет выбирать дату вручную.')); view.append(note);
    const collection = create('section', 'cq-collection'); (data.activities || []).filter(activity => activity.status === 'published').forEach(activity => collection.append(activityCard(activity))); view.append(collection); return view;
  }
  async function renderEnrollments() {
    const data = await bootstrap(); const view = create('div', 'cq-grid'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    if (!data.enrollments?.length) { view.append(emptyState('В вашем learning hub пока пусто', 'Когда вы выберете опубликованную сессию, здесь появятся её статус, напоминания, календарь и evidence.', '/app/catalog', 'Открыть каталог')); return view; }
    const listCard = card(); const list = create('div', 'cq-list'); data.enrollments.forEach(enrollment => { const item = create('div', 'cq-list-item'); const activity = data.activities.find(value => value.id === enrollment.activityId); append(item, create('span', 'cq-list-icon', '◷'), create('div', 'cq-list-copy', ''), status(enrollment.status || 'enrolled', 'success')); const copy = item.querySelector('.cq-list-copy'); append(copy, create('strong', '', activity?.title || enrollment.activityId), create('span', '', 'Дата сессии и статусы attendance будут добавлены в Task 2.')); list.append(item); }); listCard.append(list); view.append(listCard); return view;
  }
  async function renderDevelopmentPlan() {
    const data = await bootstrap(); const view = create('div', 'cq-grid cq-grid--two'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const plan = card(); const head = create('div', 'cq-card-head'); append(head, create('div', '', ''), status(`Цель: ${data.employee.targetGrade}`, 'success')); head.firstChild.append(create('h2', '', 'Карта ключевых навыков'), create('p', '', 'Показаны самые значимые требования следующего карьерного шага.')); append(plan, head, skillRows(data.employee.skills));
    const rules = card(); append(rules, create('div', 'cq-card-head'), create('div', 'cq-list')); const ruleHead = rules.querySelector('.cq-card-head'); ruleHead.append(create('div', '', '')); ruleHead.firstChild.append(create('h2', '', 'Как работает рекомендация'), create('p', '', 'Без автоматического кадрового решения.'));
    const list = rules.querySelector('.cq-list'); ['Сопоставляет текущий уровень и требования цели.', 'Учитывает формат активности и её ожидаемый эффект.', 'Объясняет следующий шаг и показывает альтернативы.', 'Обновляет прогресс только после evidence и review.'].forEach((value, index) => { const row = create('div', 'cq-list-item'); append(row, create('span', 'cq-list-icon', String(index + 1)), create('div', 'cq-list-copy', value)); list.append(row); }); view.append(plan, rules); return view;
  }
  function renderNotifications() {
    const view = create('div', 'cq-grid cq-grid--two'); const telegram = card(); const head = create('div', 'cq-card-head'); append(head, create('div', '', ''), status('Подключается после записи', 'warning')); head.firstChild.append(create('h2', '', 'Telegram'), create('p', '', 'Привязка создаётся одноразовой ссылкой и может быть отключена пользователем.')); const list = create('div', 'cq-list'); const row = create('div', 'cq-list-item'); append(row, create('span', 'cq-list-icon', '◌'), create('div', 'cq-list-copy', ''), create('span', 'cq-list-meta', '7 д · 24 ч · 1 ч')); const copy = row.querySelector('.cq-list-copy'); append(copy, create('strong', '', 'Напоминания о выбранной сессии'), create('span', '', 'Delivery history, повторное подключение и частота появятся в Task 2.')); list.append(row); append(telegram, head, list);
    const privacy = card(); append(privacy, create('div', 'cq-card-head'), create('p', '', '')); const pHead = privacy.querySelector('.cq-card-head'); pHead.append(create('div', '', '')); pHead.firstChild.append(create('h2', '', 'Ваш контроль'), create('p', '', 'Уведомления — opt-in, а не обязательный канал.')); privacy.append(create('div', 'cq-alert', 'Telegram chat ID не показывается в интерфейсе HR и не должен попадать в логи.'));
    append(view, telegram, privacy); return view;
  }
  async function renderProfile() {
    const data = await bootstrap(); const employee = data.employee; const view = create('div', 'cq-grid cq-grid--two'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const profile = card(); const head = create('div', 'cq-card-head'); const avatar = create('span', 'cq-avatar', initials(employee.name)); append(head, create('div', '', ''), avatar); head.firstChild.append(create('h2', '', employee.name), create('p', '', `${employee.role} · ${employee.grade}`)); const list = create('div', 'cq-list'); [['Цель развития', employee.targetGrade], ['Стаж в компании', `${Math.max(1, Math.round((employee.tenureMonths || 0) / 12))} года`], ['Данные профиля', 'Корпоративный источник']].forEach(([name, value]) => { const row = create('div', 'cq-list-item'); append(row, create('span', 'cq-list-icon', '•'), create('div', 'cq-list-copy', name), create('span', 'cq-list-meta', value)); list.append(row); }); append(profile, head, list);
    const note = card(); append(note, create('h2', '', 'О данных профиля'), create('p', '', 'В production профиль синхронизируется из корпоративного источника по принципу минимально необходимых данных. Изменения карьерной цели и consent будут иметь отдельную историю.')); view.append(profile, note); return view;
  }
  async function renderManagerTeam() {
    const data = await bootstrap('E0028'); const employee = data.employee; const view = create('div', 'cq-grid'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const metrics = create('div', 'cq-grid cq-grid--three'); [['Прямые подчинённые', '1', 'Без публичного ранжирования'], ['Ожидают review', '0', 'Task 3 добавит очередь'], ['Следующий touchpoint', '—', 'Появится с activity session']].forEach(([label, value, note]) => { const item = card('cq-card cq-metric'); append(item, create('small', '', label), create('strong', '', value), create('span', '', note)); metrics.append(item); }); view.append(metrics);
    const member = card(); const head = create('div', 'cq-card-head'); append(head, create('div', '', ''), status(`Готовность ${employee.readiness}%`, 'success')); head.firstChild.append(create('h2', '', employee.name), create('p', '', `${employee.role} · цель ${employee.targetGrade}`)); member.append(head, skillRows(employee.skills)); view.append(member); return view;
  }
  function renderReviews() { return emptyState('Пока нет evidence на проверке', 'В Task 3 здесь появятся только evidence прямых подчинённых, статусы и действия «Подтвердить» / «Вернуть на доработку».', '/manager/team', 'Открыть команду'); }
  async function hrActivities() {
    try { return { activities: (await api('/api/v1/hr/activities')).activities || [], source: 'api' }; }
    catch (error) { return { activities: fallback.activities, source: 'fallback', error }; }
  }
  async function renderHrOverview() {
    const data = await hrActivities(); const view = create('div', 'cq-grid'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const published = data.activities.filter(item => item.status === 'published').length; const drafts = data.activities.filter(item => item.status === 'draft').length;
    const metrics = create('div', 'cq-grid cq-grid--three'); [[`Опубликованные активности`, published, 'Доступны в подходящих каталогах'], ['Черновики', drafts, 'Требуют проверки HR'], ['Сессии и места', '—', 'Добавляются в Task 2']].forEach(([label, value, note]) => { const item = card('cq-card cq-metric'); append(item, create('small', '', label), create('strong', '', value), create('span', '', note)); metrics.append(item); }); view.append(metrics);
    const next = card(); append(next, create('div', 'cq-card-head')); const head = next.querySelector('.cq-card-head'); head.append(create('div', '', ''), status('Следующий этап', 'warning')); head.firstChild.append(create('h2', '', 'Сначала создаём модели сессий'), create('p', '', 'После этого HR сможет управлять датой, местом, вместимостью, участниками и отменой конкретного потока.')); next.append(link('Открыть каталог HR', '/hr/activities', 'cq-button cq-button--dark')); view.append(next); return view;
  }
  async function renderHrActivities() {
    const data = await hrActivities(); const view = create('div', 'cq-grid'); if (data.source === 'fallback') view.append(showSourceNotice(data.error));
    const note = create('div', 'cq-alert'); append(note, create('span', '', 'i'), create('div', '', '')); const copy = note.lastChild; append(copy, create('strong', '', 'Каталог защищён ролью HR'), create('p', '', 'Сейчас можно просмотреть real development API data. Конструктор сессий и публикация с валидаторами будут реализованы следующим HR-блоком.')); view.append(note);
    const collection = create('section', 'cq-collection'); data.activities.forEach(activity => collection.append(activityCard(activity))); view.append(collection); return view;
  }
  function renderHrAnalytics() {
    const view = create('div', 'cq-grid cq-grid--three'); [['Skill gaps', 'System Design', 'Агрегированный приоритет программы'], ['Охват', '—', 'Появится после session/enrollment'], ['Completion', '—', 'Только подтверждённые результаты']].forEach(([label, value, note]) => { const item = card('cq-card cq-metric'); append(item, create('small', '', label), create('strong', '', value), create('span', '', note)); view.append(item); }); const alert = create('div', 'cq-alert'); append(alert, create('span', '', 'i'), create('div', '', '')); const copy = alert.lastChild; append(copy, create('strong', '', 'Приватность по умолчанию'), create('p', '', 'Будущая аналитика использует агрегаты и минимальный размер когорты; персональные рейтинги не входят в продукт.')); view.append(alert); return view;
  }
  async function renderAdminOverview() {
    let health = null; try { health = await fetch('/api/health').then(response => response.ok ? response.json() : null); } catch { /* offline state shown below */ }
    const view = create('div', 'cq-grid cq-grid--three'); [['Identity', 'SSO required', 'Dev header нельзя использовать в production'], ['Telegram', health?.telegramConfigured ? 'Configured' : 'Не настроен', 'Polling и webhook взаимоисключаемы'], ['Хранилище', 'Demo JSON', 'Postgres/outbox обязателен до production']].forEach(([label, value, note]) => { const item = card('cq-card cq-metric'); append(item, create('small', '', label), create('strong', '', value), create('span', '', note)); view.append(item); }); const governance = card(); append(governance, create('div', 'cq-card-head'), create('div', 'cq-list')); const head = governance.querySelector('.cq-card-head'); head.append(create('div', '', ''), status('Task 5', 'warning')); head.firstChild.append(create('h2', '', 'Governance workspace'), create('p', '', 'Следующий admin-блок добавит роли, taxonomy, integrations и immutable audit log.')); const list = governance.querySelector('.cq-list'); ['Роль назначается сервером после SSO.', 'Каждое privileged действие создаёт audit event.', 'Секреты и chat IDs не отображаются в UI.'].forEach(value => { const row = create('div', 'cq-list-item'); append(row, create('span', 'cq-list-icon', '✓'), create('div', 'cq-list-copy', value)); list.append(row); }); view.append(governance); return view;
  }
})();
