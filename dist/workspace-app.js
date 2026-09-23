(() => {
  'use strict';

  const SESSION_KEY = 'careerQuestDemoSession';
  const root = document.getElementById('career-quest-app');
  if (!root) return;

  const roleLabels = {
    employee: 'Сотрудник',
    manager: 'Руководитель',
    hr: 'HR-партнёр',
    admin: 'Администратор'
  };

  const homeByRole = {
    employee: '/app/home',
    manager: '/manager/team',
    hr: '/hr/overview',
    admin: '/admin/overview'
  };

  const navigation = {
    employee: [
      { href: '/app/home', label: 'Мой план', icon: '⌂', match: 'home' },
      { href: '/app/catalog', label: 'Каталог', icon: '▦', match: 'catalog' },
      { href: '/app/enrollments', label: 'Мои активности', icon: '◷', match: 'enrollments' },
      { href: '/app/development-plan', label: 'Карта навыков', icon: '◎', match: 'development-plan' },
      { href: '/app/notifications', label: 'Уведомления', icon: '◌', match: 'notifications' },
      { href: '/app/profile', label: 'Профиль', icon: '◉', match: 'profile' }
    ],
    manager: [
      { href: '/manager/team', label: 'Моя команда', icon: '◫', match: 'team' },
      { href: '/manager/reviews', label: 'Проверка результатов', icon: '✓', match: 'reviews' }
    ],
    hr: [
      { href: '/hr/overview', label: 'Обзор программы', icon: '◫', match: 'overview' },
      { href: '/hr/activities', label: 'Активности', icon: '▦', match: 'activities' },
      { href: '/hr/people', label: 'Сотрудники', icon: '◉', match: 'people' }
    ],
    admin: [
      { href: '/admin/overview', label: 'Обзор системы', icon: '◫', match: 'overview' },
      { href: '/admin/users', label: 'Пользователи и роли', icon: '◉', match: 'users' },
      { href: '/admin/integrations', label: 'Интеграции', icon: '⌘', match: 'integrations' }
    ]
  };

  const state = {
    bootstrap: null,
    activityDetails: new Map(),
    selectedSessions: new Map(),
    catalogQuery: '',
    busy: null,
    toast: null,
    toastTimer: null,
    telegramLink: null,
    cancelTargetId: null,
    cancelError: null,
    renderVersion: 0
  };

  class ApiError extends Error {
    constructor(status, message, code) {
      super(message || 'Не удалось выполнить запрос');
      this.status = status;
      this.code = code || null;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function readSession() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
      if (!value || typeof value !== 'object') return null;
      if (!Object.prototype.hasOwnProperty.call(roleLabels, value.role)) return null;
      if (typeof value.actorId !== 'string' || !value.actorId.trim()) return null;
      if (value.role === 'employee' && (typeof value.employeeId !== 'string' || !value.employeeId.trim())) return null;
      return {
        actorId: value.actorId,
        role: value.role,
        employeeId: value.employeeId || null,
        name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : roleLabels[value.role],
        initials: typeof value.initials === 'string' && value.initials.trim() ? value.initials.trim().slice(0, 3) : 'CQ'
      };
    } catch {
      return null;
    }
  }

  const session = readSession();

  function installRuntimeStyles() {
    if (document.getElementById('cq-workspace-runtime-styles')) return;
    const style = document.createElement('style');
    style.id = 'cq-workspace-runtime-styles';
    style.textContent = `
      .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
      .cq-workspace-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin:0 0 20px; }
      .cq-workspace-search { display:flex; flex:1 1 320px; max-width:550px; gap:8px; }
      .cq-workspace-search input { min-width:0; width:100%; min-height:42px; padding:9px 12px; border:1px solid var(--cq-line); border-radius:13px; color:var(--cq-ink); background:#fff; }
      .cq-workspace-filter-note { color:var(--cq-muted); font-size:13px; font-weight:700; }
      .cq-workspace-back { display:inline-flex; align-items:center; gap:7px; margin-bottom:18px; color:#5261d0; font-size:13px; font-weight:800; }
      .cq-workspace-back:hover { text-decoration:underline; }
      .cq-workspace-meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:17px; }
      .cq-workspace-meta span { padding:7px 9px; border:1px solid var(--cq-line); border-radius:10px; color:#536078; background:#fbfcff; font-size:12px; font-weight:700; }
      .cq-workspace-meta--dark span { border-color:rgba(255,255,255,.12); color:#d7dfef; background:rgba(255,255,255,.06); }
      .cq-workspace-session-list { display:grid; gap:11px; margin:18px 0 0; }
      .cq-workspace-session-choice { position:relative; display:block; cursor:pointer; padding:15px; border:1px solid var(--cq-line); border-radius:16px; color:var(--cq-ink); background:#fff; transition:border-color .18s ease, box-shadow .18s ease, background .18s ease; }
      .cq-workspace-session-choice:hover { border-color:#afb7ed; background:#fbfbff; }
      .cq-workspace-session-choice:has(input:checked) { border-color:var(--cq-blue); box-shadow:0 0 0 3px rgba(94,108,242,.12); background:#f8f8ff; }
      .cq-workspace-session-choice:has(input:disabled) { cursor:not-allowed; opacity:.67; }
      .cq-workspace-session-choice input { position:absolute; top:17px; left:15px; width:18px; height:18px; accent-color:var(--cq-blue); }
      .cq-workspace-session-choice-content { display:block; padding-left:29px; }
      .cq-workspace-session-choice-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .cq-workspace-session-choice strong { display:block; font-size:14px; }
      .cq-workspace-session-choice p { margin:5px 0 0; color:var(--cq-muted); font-size:12px; }
      .cq-workspace-session-choice small { display:block; margin-top:9px; color:#526078; font-size:12px; font-weight:700; }
      .cq-workspace-detail-layout { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(295px,.75fr); gap:17px; align-items:start; }
      .cq-workspace-detail-side { position:sticky; top:94px; }
      .cq-workspace-detail-side h2 { margin:0; font-size:20px; letter-spacing:-.025em; }
      .cq-workspace-detail-side p { margin:8px 0 0; color:var(--cq-muted); font-size:13px; }
      .cq-workspace-detail-actions { display:grid; gap:9px; margin-top:19px; }
      .cq-workspace-detail-actions .cq-button { width:100%; }
      .cq-workspace-note { margin-top:16px; padding:12px 13px; border-left:3px solid var(--cq-lime); border-radius:0 12px 12px 0; color:#596477; background:#f4f8eb; font-size:12px; }
      .cq-workspace-stat-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:17px; }
      .cq-workspace-stat-row .cq-card { min-width:0; }
      .cq-workspace-enrollment { align-items:flex-start; }
      .cq-workspace-enrollment .cq-list-meta { min-width:132px; }
      .cq-workspace-enrollment-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:9px; }
      .cq-workspace-enrollment-actions .cq-button { min-height:34px; padding:7px 10px; border-radius:10px; font-size:12px; }
      .cq-workspace-alert-success { border-color:#b8ead8; color:#087157; background:var(--cq-success-bg); }
      .cq-workspace-alert-warning { border-color:#ffe1a7; color:#9a5700; background:var(--cq-warning-bg); }
      .cq-workspace-alert-danger { border-color:#ffc8c2; color:var(--cq-danger); background:var(--cq-danger-bg); }
      .cq-workspace-alert a { color:inherit; font-weight:850; text-decoration:underline; }
      .cq-workspace-toast { position:fixed; z-index:50; right:22px; bottom:22px; max-width:min(390px,calc(100vw - 32px)); padding:13px 15px; border-radius:14px; color:#fff; background:var(--cq-navy); box-shadow:0 18px 45px rgba(11,16,32,.28); font-size:13px; font-weight:750; }
      .cq-workspace-toast--error { background:#8f2922; }
      .cq-workspace-dialog { width:min(470px,calc(100% - 32px)); padding:0; border:0; border-radius:20px; color:var(--cq-ink); box-shadow:0 25px 80px rgba(10,16,34,.32); }
      .cq-workspace-dialog::backdrop { background:rgba(7,11,24,.55); backdrop-filter:blur(3px); }
      .cq-workspace-dialog-inner { padding:25px; }
      .cq-workspace-dialog h2 { margin:0; font-size:23px; letter-spacing:-.04em; }
      .cq-workspace-dialog p { margin:10px 0 0; color:var(--cq-muted); }
      .cq-workspace-dialog-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:9px; margin-top:24px; }
      .cq-workspace-hero-number { display:block; margin-top:7px; font-size:29px; line-height:1; letter-spacing:-.05em; }
      .cq-workspace-placeholder { min-height:330px; display:flex; flex-direction:column; justify-content:center; }
      .cq-workspace-placeholder .cq-card { max-width:760px; }
      .cq-workspace-profile-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(260px,.62fr); gap:17px; }
      .cq-workspace-list-link { color:inherit; }
      .cq-workspace-list-link:hover strong { color:#5261d0; }
      .cq-workspace-telegram-link { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-top:15px; }
      @media (max-width:980px) { .cq-workspace-detail-layout,.cq-workspace-profile-grid { grid-template-columns:1fr; } .cq-workspace-detail-side { position:static; } }
      @media (max-width:760px) { .cq-workspace-stat-row { grid-template-columns:1fr; } .cq-workspace-enrollment-actions { justify-content:flex-start; } .cq-workspace-enrollment .cq-list-meta { min-width:0; } .cq-workspace-search { flex-basis:100%; max-width:none; } .cq-workspace-toast { right:16px; bottom:16px; } }
    `;
    document.head.append(style);
  }

  function redirectToSignIn() {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  function normalizePath(pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    return path === '/app' ? '/app/home' : path;
  }

  function decodePathPart(value) {
    try { return decodeURIComponent(value); }
    catch { return null; }
  }

  function resolveRoute(pathname) {
    const path = normalizePath(pathname);
    const exact = {
      '/app/home': { role: 'employee', kind: 'home', title: 'Мой план' },
      '/app/catalog': { role: 'employee', kind: 'catalog', title: 'Каталог активностей' },
      '/app/enrollments': { role: 'employee', kind: 'enrollments', title: 'Мои активности' },
      '/app/development-plan': { role: 'employee', kind: 'development-plan', title: 'Карта навыков' },
      '/app/notifications': { role: 'employee', kind: 'notifications', title: 'Уведомления' },
      '/app/profile': { role: 'employee', kind: 'profile', title: 'Профиль' },
      '/manager/team': { role: 'manager', kind: 'team', title: 'Моя команда' },
      '/manager/reviews': { role: 'manager', kind: 'reviews', title: 'Проверка результатов' },
      '/hr/overview': { role: 'hr', kind: 'overview', title: 'Обзор программы' },
      '/hr/activities': { role: 'hr', kind: 'activities', title: 'Активности' },
      '/hr/people': { role: 'hr', kind: 'people', title: 'Сотрудники' },
      '/admin/overview': { role: 'admin', kind: 'overview', title: 'Обзор системы' },
      '/admin/users': { role: 'admin', kind: 'users', title: 'Пользователи и роли' },
      '/admin/integrations': { role: 'admin', kind: 'integrations', title: 'Интеграции' }
    };
    if (exact[path]) return { ...exact[path], path };

    let match = path.match(/^\/app\/activities\/([^/]+)$/);
    if (match) {
      const activityId = decodePathPart(match[1]);
      return activityId ? { role: 'employee', kind: 'activity-detail', title: 'Активность', activityId, path } : { role: 'employee', kind: 'not-found', title: 'Не найдено', path };
    }
    match = path.match(/^\/app\/enrollments\/([^/]+)$/);
    if (match) {
      const enrollmentId = decodePathPart(match[1]);
      return enrollmentId ? { role: 'employee', kind: 'enrollment-detail', title: 'Моя активность', enrollmentId, path } : { role: 'employee', kind: 'not-found', title: 'Не найдено', path };
    }

    const roleByPrefix = path.startsWith('/manager/') ? 'manager'
      : path.startsWith('/hr/') ? 'hr'
        : path.startsWith('/admin/') ? 'admin'
          : path.startsWith('/app/') ? 'employee' : null;
    return { role: roleByPrefix, kind: 'not-found', title: 'Страница не найдена', path };
  }

  function avatarInitials(name) {
    return String(name || 'CQ').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'CQ';
  }

  function activeNavMatch(route) {
    if (route.kind === 'activity-detail') return 'catalog';
    if (route.kind === 'enrollment-detail') return 'enrollments';
    return route.kind;
  }

  function renderBrand() {
    return `<span class="cq-brand-mark" aria-hidden="true">✦</span><span>Career Quest</span>`;
  }

  function renderShell(route, content, data) {
    const role = session.role;
    const currentNav = activeNavMatch(route);
    const nav = (navigation[role] || []).map(item => {
      const active = item.match === currentNav;
      return `<a href="${item.href}" ${active ? 'aria-current="page"' : ''}><span class="cq-nav-icon" aria-hidden="true">${item.icon}</span>${item.label}</a>`;
    }).join('');
    const displayName = data?.employee?.name || session.name;
    const initials = session.initials || avatarInitials(displayName);
    const pageTitle = route.title || 'Career Quest';
    const dialog = renderCancellationDialog(data);
    const toast = state.toast ? `<div class="cq-workspace-toast ${state.toast.type === 'error' ? 'cq-workspace-toast--error' : ''}" role="status" aria-live="polite">${escapeHtml(state.toast.text)}</div>` : '';

    return `<div class="cq-app">
      <aside class="cq-sidebar" aria-label="Основная навигация">
        <a class="cq-brand" href="${homeByRole[role]}">${renderBrand()}</a>
        <div class="cq-environment">Alem Team · ${escapeHtml(roleLabels[role])}</div>
        <p class="cq-nav-label">${role === 'employee' ? 'Моё развитие' : roleLabels[role]}</p>
        <nav class="cq-nav" aria-label="Разделы ${escapeAttribute(roleLabels[role])}">${nav}</nav>
        <div class="cq-sidebar-bottom">
          <a class="cq-user-button" href="${role === 'employee' ? '/app/profile' : homeByRole[role]}">
            <span class="cq-avatar">${escapeHtml(initials)}</span>
            <span><strong>${escapeHtml(displayName)}</strong><span>${escapeHtml(roleLabels[role])}</span></span>
            <span aria-hidden="true">›</span>
          </a>
        </div>
      </aside>
      <div class="cq-app-main">
        <header class="cq-topbar">
          <a class="cq-mobile-brand" href="${homeByRole[role]}">${renderBrand()}</a>
          <span class="cq-topbar-crumb">Рабочее пространство · ${escapeHtml(pageTitle)}</span>
          <div class="cq-topbar-actions">
            <span class="cq-demo-pill" title="Демонстрационный режим">ДЕМО</span>
            ${role === 'employee' ? '<a class="cq-icon-button" href="/app/notifications" aria-label="Открыть уведомления">◌</a>' : ''}
            <button class="cq-icon-button" type="button" data-action="logout" aria-label="Выйти из деморежима">↗</button>
          </div>
        </header>
        <main id="main-content" class="cq-page" tabindex="-1">${content}</main>
      </div>
      ${dialog}
      ${toast}
    </div>`;
  }

  function renderPageHeader(title, description, actions = '') {
    return `<header class="cq-page-head"><div><p class="cq-eyebrow">CAREER QUEST / ${session.role === 'employee' ? 'МОЁ РАЗВИТИЕ' : escapeHtml(roleLabels[session.role].toUpperCase())}</p><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>${actions ? `<div class="cq-page-actions">${actions}</div>` : ''}</header>`;
  }

  function renderLoading(title = 'Загружаем данные') {
    return `${renderPageHeader(title, 'Проверяем актуальное расписание и ваши записи.')}
      <div class="cq-grid cq-grid--three" aria-busy="true" aria-label="Загрузка">
        <div class="cq-skeleton"></div><div class="cq-skeleton"></div><div class="cq-skeleton"></div>
      </div>`;
  }

  function renderEmpty(title, description, actionHtml = '') {
    return `<section class="cq-empty"><div class="cq-empty-icon" aria-hidden="true">◌</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${actionHtml ? `<div style="margin-top:18px">${actionHtml}</div>` : ''}</section>`;
  }

  function renderError(error, retryAction = 'retry') {
    const status = error?.status;
    const title = status === 403 ? 'Нет доступа к этому разделу'
      : status === 404 ? 'Ничего не найдено'
        : status === 503 ? 'Сервис временно недоступен'
          : 'Не удалось загрузить данные';
    const description = status === 403
      ? 'У вашей текущей роли нет прав на просмотр этих данных.'
      : status === 404
        ? 'Проверьте адрес или вернитесь к списку доступных активностей.'
        : error?.message || 'Проверьте подключение и повторите попытку.';
    const returnLink = session.role === 'employee' ? '<a class="cq-button cq-button--quiet" href="/app/home">На главную</a>' : `<a class="cq-button cq-button--quiet" href="${homeByRole[session.role]}">На главную</a>`;
    return `<section class="cq-error" role="alert"><div class="cq-empty-icon" aria-hidden="true">!</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><div class="cq-page-actions" style="justify-content:center;margin-top:20px"><button class="cq-button cq-button--dark" type="button" data-action="${retryAction}">Повторить</button>${returnLink}</div></section>`;
  }

  function statusInfo(status) {
    const definitions = {
      enrolled: ['Запись подтверждена', 'success'],
      confirmed: ['Участие подтверждено', 'success'],
      waitlisted: ['Лист ожидания', 'warning'],
      in_progress: ['В процессе', 'neutral'],
      submitted: ['На проверке', 'warning'],
      verified: ['Результат подтверждён', 'success'],
      revision: ['Нужны изменения', 'warning'],
      cancelled: ['Отменено', 'danger'],
      open: ['Регистрация открыта', 'success'],
      full: ['Лист ожидания', 'warning'],
      closed: ['Регистрация закрыта', 'neutral'],
      scheduled: ['Запланировано', 'neutral'],
      published: ['Опубликовано', 'success']
    };
    return definitions[status] || ['Статус уточняется', 'neutral'];
  }

  function statusBadge(status) {
    const [label, tone] = statusInfo(status);
    return `<span class="cq-status cq-status--${tone}">${escapeHtml(label)}</span>`;
  }

  function tryFormat(iso, options, timezone) {
    const value = new Date(iso);
    if (!Number.isFinite(value.getTime())) return 'Дата уточняется';
    try { return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: timezone || 'UTC' }).format(value); }
    catch { return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(value); }
  }

  function formatSessionDate(session) {
    return tryFormat(session?.startsAt, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }, session?.timezone);
  }

  function formatSessionTimeRange(session) {
    if (!session) return 'Время уточняется';
    const starts = tryFormat(session.startsAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, session.timezone);
    const ends = tryFormat(session.endsAt, { hour: '2-digit', minute: '2-digit' }, session.timezone);
    return `${starts}–${ends}`;
  }

  function formatShortDate(iso) {
    return tryFormat(iso, { day: 'numeric', month: 'short', year: 'numeric' }, 'Asia/Qyzylorda');
  }

  function formatExpiry(iso) {
    return tryFormat(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, 'Asia/Qyzylorda');
  }

  function locationLabel(session) {
    if (!session) return 'Место уточняется';
    const type = session.locationType === 'online' ? 'Онлайн' : session.locationType === 'offline' ? 'Очно' : 'Гибрид';
    const value = String(session.locationValue || '').trim();
    if (!value) return `${type} · место уточняется`;
    if (/^(онлайн|очно|гибрид)(?:\s|·|$)/i.test(value)) return value;
    return `${type} · ${value}`;
  }

  function capacityLabel(session) {
    if (!session || !Number.isFinite(Number(session.capacity))) return 'Лимит мест уточняется';
    if (session.availability === 'full') return session.waitlistEnabled ? 'Свободных мест нет · доступен лист ожидания' : 'Свободных мест нет';
    if (session.availability === 'closed' || session.availability === 'cancelled') return 'Регистрация закрыта';
    const seats = Number(session.remainingSeats);
    return `Осталось ${seats} из ${session.capacity} ${pluralizeSeats(session.capacity)}`;
  }

  function pluralizeSeats(value) {
    const lastTwo = value % 100;
    const last = value % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return 'мест';
    if (last === 1) return 'место';
    if (last >= 2 && last <= 4) return 'места';
    return 'мест';
  }

  function sessionMeta(session, dark = false) {
    if (!session) return '<div class="cq-workspace-meta"><span>Расписание уточняется</span></div>';
    return `<div class="cq-workspace-meta${dark ? ' cq-workspace-meta--dark' : ''}">
      <span>◷ ${escapeHtml(formatSessionTimeRange(session))}</span>
      <span>⌁ ${escapeHtml(session.timezone || 'UTC')}</span>
      <span>⌖ ${escapeHtml(locationLabel(session))}</span>
      <span>◉ ${escapeHtml(capacityLabel(session))}</span>
    </div>`;
  }

  function sortedSessions(sessions) {
    return [...(sessions || [])].sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)));
  }

  function sessionsForActivity(data, activityId) {
    return sortedSessions((data.sessions || []).filter(sessionItem => sessionItem.activityId === activityId));
  }

  function nextSession(data, activityId) {
    const sessions = sessionsForActivity(data, activityId);
    return sessions.find(sessionItem => sessionItem.availability === 'open') || sessions.find(sessionItem => sessionItem.availability === 'full') || sessions[0] || null;
  }

  function activeEnrollment(enrollment) {
    return ['enrolled', 'confirmed', 'in_progress', 'submitted', 'verified'].includes(enrollment?.status);
  }

  function safeTelegramUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || (host !== 't.me' && host !== 'www.t.me')) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('x-career-quest-actor', session.actorId);
    let body = options.body;
    if (body && typeof body !== 'string' && !(body instanceof Blob) && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(path, { ...options, headers, body, credentials: 'same-origin', cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.');
    }
    const type = response.headers.get('content-type') || '';
    let payload = null;
    if (type.includes('application/json')) {
      try { payload = await response.json(); }
      catch { payload = null; }
    }
    if (!response.ok) throw new ApiError(response.status, payload?.error || `Сервер вернул ошибку ${response.status}`, payload?.code);
    return payload;
  }

  async function loadBootstrap(force = false) {
    if (!force && state.bootstrap) return state.bootstrap;
    const employeeId = encodeURIComponent(session.employeeId);
    const payload = await api(`/api/v1/bootstrap?employeeId=${employeeId}`);
    if (!payload || !payload.employee || !Array.isArray(payload.activities) || !Array.isArray(payload.sessions) || !Array.isArray(payload.enrollments)) {
      throw new ApiError(500, 'Сервер вернул неполные данные рабочего пространства.');
    }
    state.bootstrap = payload;
    return payload;
  }

  async function loadActivityDetail(activityId, force = false) {
    if (!force && state.activityDetails.has(activityId)) return state.activityDetails.get(activityId);
    const payload = await api(`/api/v1/activities/${encodeURIComponent(activityId)}?employeeId=${encodeURIComponent(session.employeeId)}`);
    if (!payload || !payload.activity || !Array.isArray(payload.sessions)) throw new ApiError(500, 'Сервер вернул неполные данные сессии.');
    state.activityDetails.set(activityId, payload);
    return payload;
  }

  function renderHome(data) {
    const employee = data.employee;
    const recommended = data.activities.find(activity => activity.id === employee.recommendedActivityId) || data.activities[0] || null;
    const recommendationSession = recommended ? nextSession(data, recommended.id) : null;
    const active = data.enrollments.filter(activeEnrollment);
    const waitlisted = data.enrollments.filter(item => item.status === 'waitlisted');
    const verified = data.enrollments.filter(item => item.status === 'verified');
    const score = Math.max(0, Math.min(100, Number(employee.readiness) || 0));

    const primary = recommended ? `<section class="cq-card cq-next-action">
      <p class="cq-eyebrow">Следующий рекомендованный шаг</p>
      <h2>${escapeHtml(recommended.title)}</h2>
      <p>${escapeHtml(recommended.description)}</p>
      ${sessionMeta(recommendationSession, true)}
      <div class="cq-action-footer"><span>${escapeHtml(recommended.skillName || 'Развитие навыка')} · +${escapeHtml(recommended.skillImpact || 1)} уровень</span><a class="cq-button" href="/app/activities/${encodeURIComponent(recommended.id)}">Выбрать сессию</a></div>
    </section>` : renderEmpty('Нет доступных активностей', 'HR ещё не опубликовал подходящие активности.');

    const upcoming = sortedSessions(active.map(item => item.session).filter(Boolean))[0] || recommendationSession;
    return `${renderPageHeader('Мой план развития', `Здравствуйте, ${employee.name.split(/\s+/)[0] || employee.name}. Здесь собраны ваши следующие шаги.`)}
      <div class="cq-grid cq-grid--two">
        ${primary}
        <section class="cq-card cq-card--pad cq-score-card">
          <div class="cq-score-ring" style="--score:${score}"><strong>${score}%</strong><span>готовность</span></div>
          <div><h3>${escapeHtml(employee.role)}</h3><p>${escapeHtml(employee.grade)} → <strong>${escapeHtml(employee.targetGrade)}</strong></p><p>${escapeHtml(employee.requirements || 'Карьерные требования уточняются')}</p><div style="margin-top:15px"><a class="cq-button cq-button--quiet" href="/app/development-plan">Открыть карту навыков</a></div></div>
        </section>
      </div>
      <div class="cq-workspace-stat-row" style="margin-top:17px">
        <section class="cq-card cq-metric"><small>Предстоящие записи</small><strong>${active.length}</strong><span>Сессии с подтверждённым местом</span></section>
        <section class="cq-card cq-metric"><small>Лист ожидания</small><strong>${waitlisted.length}</strong><span>${waitlisted.length ? 'Мы сообщим, если освободится место' : 'Нет активных ожиданий'}</span></section>
        <section class="cq-card cq-metric"><small>Подтверждённые результаты</small><strong>${verified.length}</strong><span>Прогресс после проверки</span></section>
      </div>
      <div class="cq-grid cq-grid--two">
        <section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>Навыки для следующего шага</h2><p>Текущий уровень и ориентир для роли ${escapeHtml(employee.targetGrade)}.</p></div><a class="cq-button cq-button--quiet" href="/app/development-plan">Все навыки</a></div>
          <div style="margin-top:20px">${employee.skills.map(skill => renderSkill(skill)).join('')}</div>
        </section>
        <section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>Ближайшее в расписании</h2><p>Дата, место и часовой пояс всегда берутся из серверной сессии.</p></div><a class="cq-button cq-button--quiet" href="/app/enrollments">Мои записи</a></div>
          ${upcoming ? `<div class="cq-list"><a class="cq-list-item cq-workspace-list-link" href="${active.find(item => item.session?.id === upcoming.id) ? `/app/enrollments/${encodeURIComponent(active.find(item => item.session?.id === upcoming.id).id)}` : `/app/activities/${encodeURIComponent(recommended?.id || upcoming.activityId)}`}"><span class="cq-list-icon">◷</span><span class="cq-list-copy"><strong>${escapeHtml(active.find(item => item.session?.id === upcoming.id)?.activity?.title || recommended?.title || 'Ближайшая сессия')}</strong><span>${escapeHtml(formatSessionDate(upcoming))} · ${escapeHtml(upcoming.timezone || 'UTC')}</span></span><span class="cq-list-meta">${escapeHtml(capacityLabel(upcoming))}</span></a></div>` : renderEmpty('Пока нет ближайших сессий', 'Посмотрите каталог, чтобы выбрать подходящую активность.', '<a class="cq-button cq-button--dark" href="/app/catalog">Открыть каталог</a>')}
        </section>
      </div>`;
  }

  function renderSkill(skill) {
    const current = Math.max(0, Number(skill.level) || 0);
    const target = Math.max(1, Number(skill.targetLevel) || 1);
    const percent = Math.min(100, Math.round((current / target) * 100));
    return `<div class="cq-skill-row"><strong>${escapeHtml(skill.name)}</strong><span>${current} / ${target}</span><div class="cq-progress" aria-label="${escapeAttribute(skill.name)}: ${current} из ${target}"><i style="width:${percent}%"></i></div></div>`;
  }

  function renderCatalog(data) {
    const query = state.catalogQuery.trim().toLocaleLowerCase('ru-RU');
    const activities = data.activities.filter(activity => {
      if (!query) return true;
      return `${activity.title} ${activity.description} ${activity.skillName} ${activity.format}`.toLocaleLowerCase('ru-RU').includes(query);
    });
    const cards = activities.map(activity => renderActivityCard(activity, nextSession(data, activity.id), data)).join('');
    return `${renderPageHeader('Каталог активностей', 'Выберите опубликованную сессию: дата, лимит мест и формат фиксируются на сервере.')}
      <div class="cq-workspace-toolbar"><form class="cq-workspace-search" data-form="catalog-search" role="search"><label class="sr-only" for="cq-catalog-search">Поиск активности</label><input id="cq-catalog-search" name="query" value="${escapeAttribute(state.catalogQuery)}" placeholder="Поиск по навыку, формату или названию" autocomplete="off"><button class="cq-button cq-button--quiet" type="submit">Найти</button></form><span class="cq-workspace-filter-note">${activities.length} ${activities.length === 1 ? 'активность' : activities.length >= 2 && activities.length <= 4 ? 'активности' : 'активностей'}</span></div>
      ${cards ? `<div class="cq-collection">${cards}</div>` : renderEmpty('Ничего не найдено', 'Измените запрос или вернитесь к полному списку.', '<button class="cq-button cq-button--quiet" type="button" data-action="clear-catalog-search">Сбросить поиск</button>')}`;
  }

  function renderActivityCard(activity, sessionItem, data) {
    const existing = (data.enrollments || []).find(enrollment => enrollment.sessionId === sessionItem?.id && enrollment.status !== 'cancelled');
    const summary = sessionItem ? `<p>${escapeHtml(formatSessionDate(sessionItem))}</p>${sessionMeta(sessionItem)}` : '<p>Расписание следующей сессии появится позднее.</p>';
    return `<article class="cq-card cq-activity"><div class="cq-activity-top"><span class="cq-status cq-status--neutral">${escapeHtml(activity.format || 'Активность')}</span>${activity.id === data.employee.recommendedActivityId ? '<span class="cq-status cq-status--success">Для вашей цели</span>' : ''}</div><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.description)}</p><div style="margin-top:13px">${summary}</div><div class="cq-activity-footer"><span>${escapeHtml(activity.skillName || 'Навык')} · +${escapeHtml(activity.skillImpact || 1)}</span>${existing ? `<a class="cq-button cq-button--quiet" href="/app/enrollments/${encodeURIComponent(existing.id)}">Моя запись</a>` : `<a class="cq-button cq-button--quiet" href="/app/activities/${encodeURIComponent(activity.id)}">Смотреть сессии</a>`}</div></article>`;
  }

  function chooseInitialSession(activityId, sessions) {
    const selected = state.selectedSessions.get(activityId);
    if (selected && sessions.some(sessionItem => sessionItem.id === selected)) return selected;
    const first = sessions.find(sessionItem => sessionItem.availability === 'open') || sessions.find(sessionItem => sessionItem.availability === 'full') || sessions[0] || null;
    if (first) state.selectedSessions.set(activityId, first.id);
    return first?.id || null;
  }

  function renderActivityDetail(detail, data) {
    const { activity } = detail;
    const sessions = sortedSessions(detail.sessions);
    const selectedId = chooseInitialSession(activity.id, sessions);
    const selected = sessions.find(sessionItem => sessionItem.id === selectedId) || null;
    const existing = selected ? data.enrollments.find(enrollment => enrollment.sessionId === selected.id && enrollment.status !== 'cancelled') : null;
    const canChoose = selected && ['open', 'full'].includes(selected.availability) && !existing;
    const actionLabel = selected?.availability === 'full' ? 'Встать в лист ожидания' : 'Записаться на сессию';
    const action = existing ? `<a class="cq-button cq-button--dark" href="/app/enrollments/${encodeURIComponent(existing.id)}">Открыть мою запись</a>`
      : canChoose ? `<button class="cq-button cq-button--dark" type="button" data-action="enroll-session" data-session-id="${escapeAttribute(selected.id)}" ${state.busy === `enroll:${selected.id}` ? 'disabled aria-busy="true"' : ''}>${state.busy === `enroll:${selected.id}` ? 'Сохраняем…' : actionLabel}</button>`
        : '<button class="cq-button cq-button--quiet" type="button" disabled>Регистрация недоступна</button>';

    return `<a class="cq-workspace-back" href="/app/catalog">← Вернуться в каталог</a>
      ${renderPageHeader(activity.title, activity.description, statusBadge(activity.status || 'scheduled'))}
      <div class="cq-workspace-detail-layout">
        <section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>Выберите сессию</h2><p>Выбор определяет дату, лимит мест и дальнейшие напоминания. Дату нельзя изменить в браузере.</p></div><span class="cq-status cq-status--neutral">${escapeHtml(activity.format || 'Активность')}</span></div>
          ${sessions.length ? `<fieldset class="cq-workspace-session-list"><legend class="sr-only">Доступные сессии</legend>${sessions.map(sessionItem => renderSessionChoice(activity.id, sessionItem, selectedId)).join('')}</fieldset>` : renderEmpty('Сессий пока нет', 'HR опубликует расписание отдельно. Добавьте активность в избранное и вернитесь позже.')}
        </section>
        <aside class="cq-card cq-card--pad cq-workspace-detail-side"><h2>${selected ? escapeHtml(formatSessionDate(selected)) : 'Выберите сессию'}</h2>${selected ? `<p>${escapeHtml(locationLabel(selected))}</p>${sessionMeta(selected)}<div style="margin-top:16px">${statusBadge(selected.employeeEnrollmentStatus || selected.availability)}</div><div class="cq-workspace-detail-actions">${action}<a class="cq-button cq-button--quiet" href="/app/enrollments">Мои активности</a></div><div class="cq-workspace-note">${selected.availability === 'full' ? 'Мест нет: сервер добавит вас в лист ожидания. Если освободится место, статус изменится автоматически.' : 'После записи календарь и Telegram доступны из карточки вашей активности.'}</div>` : '<p>Выберите вариант слева, чтобы увидеть детали.</p>'}</aside>
      </div>`;
  }

  function renderSessionChoice(activityId, sessionItem, selectedId) {
    const disabled = !['open', 'full'].includes(sessionItem.availability) || Boolean(sessionItem.employeeEnrollmentStatus);
    const checked = sessionItem.id === selectedId;
    const current = sessionItem.employeeEnrollmentStatus ? statusBadge(sessionItem.employeeEnrollmentStatus) : statusBadge(sessionItem.availability);
    return `<label class="cq-workspace-session-choice"><input type="radio" name="cq-session-${escapeAttribute(activityId)}" value="${escapeAttribute(sessionItem.id)}" data-activity-id="${escapeAttribute(activityId)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="cq-workspace-session-choice-content"><span class="cq-workspace-session-choice-top"><strong>${escapeHtml(formatSessionDate(sessionItem))}</strong>${current}</span><p>${escapeHtml(locationLabel(sessionItem))}</p><small>${escapeHtml(capacityLabel(sessionItem))} · ${escapeHtml(sessionItem.timezone || 'UTC')}</small></span></label>`;
  }

  function renderEnrollments(data) {
    const items = [...data.enrollments].sort((left, right) => String(left.session?.startsAt || left.createdAt).localeCompare(String(right.session?.startsAt || right.createdAt)));
    return `${renderPageHeader('Мои активности', 'Все записи привязаны к конкретной серверной сессии. Здесь можно открыть календарь или отменить участие до дедлайна.', '<a class="cq-button cq-button--dark" href="/app/catalog">Найти активность</a>')}
      ${items.length ? `<section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>Записи и статусы</h2><p>Сведения о времени, месте и доступных действиях обновляются после каждого запроса.</p></div><span class="cq-status cq-status--neutral">${items.length} ${items.length === 1 ? 'запись' : items.length < 5 ? 'записи' : 'записей'}</span></div><div class="cq-list">${items.map(renderEnrollmentRow).join('')}</div></section>` : renderEmpty('Пока нет записей', 'Откройте каталог, выберите сессию и мы сохраним её в вашем плане.', '<a class="cq-button cq-button--dark" href="/app/catalog">Открыть каталог</a>')}`;
  }

  function renderEnrollmentRow(enrollment) {
    const activity = enrollment.activity || {};
    const sessionItem = enrollment.session;
    const details = sessionItem ? `${formatSessionDate(sessionItem)} · ${sessionItem.timezone || 'UTC'} · ${locationLabel(sessionItem)}` : 'Историческая запись без привязанной сессии';
    const actions = `<div class="cq-workspace-enrollment-actions"><a class="cq-button cq-button--quiet" href="/app/enrollments/${encodeURIComponent(enrollment.id)}">Открыть</a>${['enrolled', 'confirmed'].includes(enrollment.status) && sessionItem ? `<button class="cq-button cq-button--quiet" type="button" data-action="download-calendar" data-enrollment-id="${escapeAttribute(enrollment.id)}">Календарь</button>` : ''}</div>`;
    return `<div class="cq-list-item cq-workspace-enrollment"><span class="cq-list-icon">◷</span><span class="cq-list-copy"><strong>${escapeHtml(activity.title || 'Активность')}</strong><span>${escapeHtml(details)}</span>${actions}</span><span class="cq-list-meta">${statusBadge(enrollment.status)}</span></div>`;
  }

  function renderEnrollmentDetail(enrollment, data) {
    const activity = enrollment.activity || {};
    const sessionItem = enrollment.session;
    const canCancel = ['enrolled', 'confirmed', 'waitlisted'].includes(enrollment.status) && Boolean(sessionItem);
    const canDownload = ['enrolled', 'confirmed'].includes(enrollment.status) && Boolean(sessionItem);
    const canTelegram = ['enrolled', 'confirmed'].includes(enrollment.status) && Boolean(sessionItem) && !enrollment.reminderEnrollmentId;
    const telegram = renderTelegramLink(enrollment);
    return `<a class="cq-workspace-back" href="/app/enrollments">← Все мои активности</a>
      ${renderPageHeader(activity.title || 'Моя активность', 'Статус и расписание приходят из серверной записи.', statusBadge(enrollment.status))}
      <div class="cq-workspace-detail-layout">
        <section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>Детали сессии</h2><p>${escapeHtml(activity.description || 'Описание активности') }</p></div><span class="cq-status cq-status--neutral">${escapeHtml(activity.format || 'Активность')}</span></div>
          ${sessionItem ? `<div style="margin-top:22px"><h3 style="margin:0;font-size:22px;letter-spacing:-.035em">${escapeHtml(formatSessionDate(sessionItem))}</h3>${sessionMeta(sessionItem)}<div class="cq-workspace-note">${enrollment.status === 'waitlisted' ? 'Вы в листе ожидания. Добавить встречу в календарь можно после автоматического перевода на свободное место.' : 'Если дата, формат или место изменятся, актуальный статус появится в этой карточке.'}</div>${telegram}</div>` : '<div style="margin-top:20px">' + renderEmpty('Расписание недоступно', 'Для этой исторической записи нет сессии, поэтому календарь и напоминания не создаются.') + '</div>'}
        </section>
        <aside class="cq-card cq-card--pad cq-workspace-detail-side"><h2>Действия</h2><p>Доступные действия зависят от статуса записи и дедлайна на сервере.</p><div class="cq-workspace-detail-actions">${canDownload ? `<button class="cq-button cq-button--dark" type="button" data-action="download-calendar" data-enrollment-id="${escapeAttribute(enrollment.id)}" ${state.busy === `calendar:${enrollment.id}` ? 'disabled aria-busy="true"' : ''}>${state.busy === `calendar:${enrollment.id}` ? 'Готовим файл…' : 'Добавить в календарь'}</button>` : ''}${canTelegram ? `<button class="cq-button cq-button--quiet" type="button" data-action="connect-telegram" data-enrollment-id="${escapeAttribute(enrollment.id)}" ${state.busy === `telegram:${enrollment.id}` ? 'disabled aria-busy="true"' : ''}>${state.busy === `telegram:${enrollment.id}` ? 'Готовим ссылку…' : 'Подключить Telegram'}</button>` : ''}${enrollment.reminderEnrollmentId ? '<a class="cq-button cq-button--quiet" href="/telegram.html">Telegram-напоминания</a>' : ''}${canCancel ? `<button class="cq-button cq-button--quiet" type="button" data-action="open-cancel-dialog" data-enrollment-id="${escapeAttribute(enrollment.id)}">Отменить участие</button>` : ''}<a class="cq-button cq-button--quiet" href="/app/catalog">Найти другую активность</a></div>${canTelegram ? '<div class="cq-workspace-note">Одноразовая ссылка создаётся только по вашему явному действию и не сохраняется в браузере.</div>' : ''}</aside>
      </div>`;
  }

  function renderTelegramLink(enrollment) {
    if (!state.telegramLink || state.telegramLink.careerEnrollmentId !== enrollment.id) return '';
    const link = safeTelegramUrl(state.telegramLink.telegramConnectUrl);
    if (!link) return `<div class="cq-alert cq-workspace-alert-danger" role="alert"><div><strong>Не удалось показать ссылку</strong><p>Сервер вернул ссылку в неподдерживаемом формате. Откройте раздел Telegram и создайте её заново.</p></div></div>`;
    return `<div class="cq-alert cq-workspace-alert-success"><div><strong>Одноразовая ссылка готова</strong><p>Откройте её только в своём Telegram. Ссылка действует до ${escapeHtml(formatExpiry(state.telegramLink.linkExpiresAt))}.</p><div class="cq-workspace-telegram-link"><a class="cq-button cq-button--dark" href="${escapeAttribute(link)}" target="_blank" rel="noopener noreferrer">Открыть Telegram</a><a href="/telegram.html">Инструкция по подключению</a></div></div></div>`;
  }

  function renderDevelopmentPlan(data) {
    const employee = data.employee;
    return `${renderPageHeader('Карта навыков', `Ориентир для перехода ${employee.grade} → ${employee.targetGrade}. Уровень изменяется после подтверждения результата.`)}
      <div class="cq-workspace-profile-grid"><section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>Ключевые навыки</h2><p>Текущий уровень / целевой ориентир.</p></div><span class="cq-status cq-status--neutral">${escapeHtml(employee.targetGrade)}</span></div><div style="margin-top:22px">${employee.skills.map(renderSkill).join('')}</div></section>
      <section class="cq-card cq-card--pad"><h2 style="margin:0;font-size:20px;letter-spacing:-.025em">Как обновляется прогресс</h2><p style="color:var(--cq-muted);font-size:13px">Запись на сессию не повышает оценку сама по себе: после практики нужен результат и подтверждение руководителя.</p><div class="cq-workspace-note">Выберите активность, которая развивает навык с наибольшим разрывом, а затем зафиксируйте результат после участия.</div><div style="margin-top:18px"><a class="cq-button cq-button--dark" href="/app/catalog">Выбрать активность</a></div></section></div>`;
  }

  function renderNotifications(data) {
    const active = data.enrollments.filter(item => ['enrolled', 'confirmed', 'waitlisted'].includes(item.status));
    const entries = active.map(item => {
      const sessionItem = item.session;
      const title = item.status === 'waitlisted' ? 'Вы в листе ожидания' : 'Ваша сессия запланирована';
      const text = sessionItem ? `${item.activity?.title || 'Активность'} · ${formatSessionDate(sessionItem)} · ${sessionItem.timezone || 'UTC'}` : item.activity?.title || 'Активность';
      return `<a class="cq-list-item cq-workspace-list-link" href="/app/enrollments/${encodeURIComponent(item.id)}"><span class="cq-list-icon">◌</span><span class="cq-list-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></span><span class="cq-list-meta">${statusBadge(item.status)}</span></a>`;
    }).join('');
    return `${renderPageHeader('Уведомления', 'Здесь появляются изменения статуса записей. Канал Telegram подключается отдельно и только для выбранной сессии.')}
      <div class="cq-grid cq-grid--two"><section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>По вашим активностям</h2><p>Пока используются системные уведомления рабочего пространства.</p></div></div>${entries ? `<div class="cq-list">${entries}</div>` : renderEmpty('Новых уведомлений нет', 'Когда появится сессия или изменится статус, сообщение будет видно здесь.')}</section>
      <section class="cq-card cq-card--pad"><h2 style="margin:0;font-size:20px;letter-spacing:-.025em">Напоминания в Telegram</h2><p style="color:var(--cq-muted);font-size:13px">Подключаются для конкретной подтверждённой записи. Ссылка создаётся по запросу и действует ограниченное время.</p><div class="cq-workspace-detail-actions"><a class="cq-button cq-button--dark" href="/app/enrollments">Выбрать запись</a><a class="cq-button cq-button--quiet" href="/telegram.html">Как это работает</a></div></section></div>`;
  }

  function renderProfile(data) {
    const employee = data.employee;
    return `${renderPageHeader('Профиль', 'Проверьте карьерную цель и текущий ориентир развития.')}
      <div class="cq-workspace-profile-grid"><section class="cq-card cq-card--pad"><div class="cq-card-head"><div><h2>${escapeHtml(employee.name)}</h2><p>${escapeHtml(employee.role)} · ${escapeHtml(employee.tenureMonths)} мес. в компании</p></div><span class="cq-avatar" style="width:52px;height:52px;font-size:16px">${escapeHtml(avatarInitials(employee.name))}</span></div><div class="cq-list"><div class="cq-list-item"><span class="cq-list-icon">◎</span><span class="cq-list-copy"><strong>Карьерная цель</strong><span>${escapeHtml(employee.grade)} → ${escapeHtml(employee.targetGrade)}</span></span></div><div class="cq-list-item"><span class="cq-list-icon">◒</span><span class="cq-list-copy"><strong>Готовность</strong><span>${escapeHtml(employee.requirements || 'Требования уточняются')}</span></span><span class="cq-list-meta">${escapeHtml(employee.readiness)}%</span></div></div></section><section class="cq-card cq-card--pad"><h2 style="margin:0;font-size:20px;letter-spacing:-.025em">Нужны изменения?</h2><p style="color:var(--cq-muted);font-size:13px">В production-версии профиль и цель приходят из корпоративного SSO и HRIS. В деморежиме они доступны только для просмотра.</p><div class="cq-workspace-note">Переключить демонстрационную роль можно после выхода из текущего режима.</div><div style="margin-top:18px"><button class="cq-button cq-button--quiet" type="button" data-action="logout">Выйти из деморежима</button></div></section></div>`;
  }

  function renderRolePlaceholder(route) {
    const role = session.role;
    const content = {
      manager: {
        team: ['Моя команда', 'Здесь руководитель видит развитие прямых подчинённых, их сессии и результаты для проверки.', 'Следующий этап: подключить корпоративный каталог сотрудников и очередь проверок.'],
        reviews: ['Проверка результатов', 'Здесь появятся результаты сотрудников после прохождения активности.', 'Проверка доступна только руководителю прямого подчинённого, HR и администратору.']
      },
      hr: {
        overview: ['Обзор программы', 'Панель HR объединит охват, заполнение сессий, листы ожидания и результаты развития.', 'Структура маршрутов готова; управление каталогом подключается к защищённому API.'],
        activities: ['Активности', 'Здесь HR создаёт шаблоны активностей, публикует сессии и задаёт лимиты мест.', 'Сотрудник всегда видит только опубликованные и подходящие ему сессии.'],
        people: ['Сотрудники', 'В этом разделе будут видны агрегированные траектории и согласованные планы развития.', 'Доступ к персональным данным требует корпоративной авторизации.']
      },
      admin: {
        overview: ['Обзор системы', 'Здесь администратор контролирует роли, интеграции и аудит критичных действий.', 'Production-версия требует SSO, журналирование и управляемые политики доступа.'],
        users: ['Пользователи и роли', 'В этом разделе настраиваются роли, группы и области доступа.', 'Деморежим не даёт возможности менять реальные права.'],
        integrations: ['Интеграции', 'Здесь отображаются статусы SSO, календарей и канала Telegram.', 'Токены и секреты никогда не должны попадать в браузер.']
      }
    };
    const [title, description, note] = content[role]?.[route.kind] || ['Раздел в разработке', 'Этот раздел ещё не настроен для текущей роли.', 'Вернитесь на главную рабочего пространства.'];
    return `${renderPageHeader(title, description)}<div class="cq-workspace-placeholder"><section class="cq-card cq-card--pad"><div class="cq-empty-icon" aria-hidden="true">✦</div><h2 style="margin:15px 0 0;font-size:24px;letter-spacing:-.035em">${escapeHtml(title)}</h2><p style="max-width:620px;color:var(--cq-muted)">${escapeHtml(description)}</p><div class="cq-workspace-note">${escapeHtml(note)}</div><div style="margin-top:20px"><a class="cq-button cq-button--dark" href="${homeByRole[role]}">Вернуться в раздел</a></div></section></div>`;
  }

  function renderNotFound() {
    return `${renderPageHeader('Страница не найдена', 'Проверьте адрес или вернитесь в рабочее пространство.')}${renderEmpty('404', 'Запрошенная страница не существует или была перенесена.', `<a class="cq-button cq-button--dark" href="${homeByRole[session.role]}">На главную</a>`)}`;
  }

  function renderForbidden(route) {
    return `${renderPageHeader('Доступ ограничен', 'Эта страница предназначена для другой роли.')}${renderEmpty('Недостаточно прав', `Ваша роль — ${roleLabels[session.role]}. Для раздела требуется роль: ${route.role ? roleLabels[route.role] : 'другая роль'}.`, `<a class="cq-button cq-button--dark" href="${homeByRole[session.role]}">Вернуться в своё пространство</a>`)}`;
  }

  function renderCancellationDialog(data) {
    if (!state.cancelTargetId || !data?.enrollments) return '';
    const enrollment = data.enrollments.find(item => item.id === state.cancelTargetId);
    if (!enrollment) return '';
    return `<dialog class="cq-workspace-dialog" id="cq-cancel-dialog" aria-labelledby="cq-cancel-title"><div class="cq-workspace-dialog-inner"><h2 id="cq-cancel-title">Отменить участие?</h2><p>Вы отменяете запись на «${escapeHtml(enrollment.activity?.title || 'активность')}». Если есть лист ожидания, сервер может передать освободившееся место следующему сотруднику.</p>${state.cancelError ? `<div class="cq-alert cq-workspace-alert-danger" role="alert" style="margin-top:16px"><div>${escapeHtml(state.cancelError)}</div></div>` : ''}<div class="cq-workspace-dialog-actions"><button class="cq-button cq-button--quiet" type="button" data-action="close-cancel-dialog">Не отменять</button><button class="cq-button cq-button--dark" type="button" data-action="confirm-cancel" data-enrollment-id="${escapeAttribute(enrollment.id)}" ${state.busy === `cancel:${enrollment.id}` ? 'disabled aria-busy="true"' : ''}>${state.busy === `cancel:${enrollment.id}` ? 'Отменяем…' : 'Да, отменить'}</button></div></div></dialog>`;
  }

  async function render() {
    if (!session) {
      redirectToSignIn();
      return;
    }
    installRuntimeStyles();
    const renderId = ++state.renderVersion;
    const route = resolveRoute(window.location.pathname);
    document.title = `${route.title || 'Career Quest'} · Career Quest`;

    if (route.role && route.role !== session.role) {
      root.innerHTML = renderShell({ ...route, title: 'Доступ ограничен' }, renderForbidden(route), null);
      return;
    }
    if (route.kind === 'not-found') {
      root.innerHTML = renderShell(route, renderNotFound(), null);
      return;
    }
    if (session.role !== 'employee') {
      root.innerHTML = renderShell(route, renderRolePlaceholder(route), null);
      return;
    }

    root.innerHTML = renderShell(route, renderLoading(route.title), state.bootstrap);
    try {
      const data = await loadBootstrap();
      let content;
      if (route.kind === 'home') content = renderHome(data);
      else if (route.kind === 'catalog') content = renderCatalog(data);
      else if (route.kind === 'enrollments') content = renderEnrollments(data);
      else if (route.kind === 'development-plan') content = renderDevelopmentPlan(data);
      else if (route.kind === 'notifications') content = renderNotifications(data);
      else if (route.kind === 'profile') content = renderProfile(data);
      else if (route.kind === 'activity-detail') content = renderActivityDetail(await loadActivityDetail(route.activityId), data);
      else if (route.kind === 'enrollment-detail') {
        const enrollment = data.enrollments.find(item => item.id === route.enrollmentId);
        content = enrollment ? renderEnrollmentDetail(enrollment, data) : renderNotFound();
      } else content = renderNotFound();
      if (renderId !== state.renderVersion) return;
      root.innerHTML = renderShell(route, content, data);
      openCancellationDialogIfNeeded(data);
    } catch (error) {
      if (renderId !== state.renderVersion) return;
      root.innerHTML = renderShell(route, renderError(error), state.bootstrap);
    }
  }

  function openCancellationDialogIfNeeded(data) {
    if (!state.cancelTargetId) return;
    if (!data.enrollments.some(item => item.id === state.cancelTargetId)) {
      state.cancelTargetId = null;
      return;
    }
    const dialog = document.getElementById('cq-cancel-dialog');
    if (!dialog) return;
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      state.cancelTargetId = null;
      state.cancelError = null;
      render();
    }, { once: true });
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  }

  function setToast(text, type = 'success') {
    state.toast = { text, type };
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      state.toast = null;
      const current = document.querySelector('.cq-workspace-toast');
      if (current) current.remove();
    }, 5500);
  }

  function invalidateEmployeeData() {
    state.bootstrap = null;
    state.activityDetails.clear();
  }

  async function enrollSession(sessionId) {
    if (!sessionId || state.busy) return;
    state.busy = `enroll:${sessionId}`;
    render();
    try {
      const response = await api(`/api/v1/sessions/${encodeURIComponent(sessionId)}/enrollments`, { method: 'POST', body: {} });
      const enrollment = response?.enrollment;
      if (!enrollment?.id) throw new ApiError(500, 'Сервер не подтвердил создание записи.');
      invalidateEmployeeData();
      setToast(enrollment.status === 'waitlisted' ? 'Вы добавлены в лист ожидания. Мы покажем статус в ваших активностях.' : 'Запись создана. Календарь и Telegram доступны в карточке активности.');
      window.location.assign(`/app/enrollments/${encodeURIComponent(enrollment.id)}`);
    } catch (error) {
      state.busy = null;
      setToast(error.message || 'Не удалось создать запись.', 'error');
      render();
      return;
    }
  }

  async function cancelEnrollment(enrollmentId) {
    if (!enrollmentId || state.busy) return;
    state.busy = `cancel:${enrollmentId}`;
    state.cancelError = null;
    render();
    try {
      const response = await api(`/api/v1/enrollments/${encodeURIComponent(enrollmentId)}/cancel`, { method: 'PATCH' });
      state.cancelTargetId = null;
      state.busy = null;
      invalidateEmployeeData();
      setToast(response?.promotedEnrollment ? 'Участие отменено. Свободное место передано сотруднику из листа ожидания.' : 'Участие отменено.');
      await render();
    } catch (error) {
      state.busy = null;
      state.cancelError = error.message || 'Не удалось отменить участие.';
      await render();
    }
  }

  async function downloadCalendar(enrollmentId) {
    if (!enrollmentId || state.busy) return;
    state.busy = `calendar:${enrollmentId}`;
    render();
    try {
      const headers = new Headers({ Accept: 'text/calendar', 'x-career-quest-actor': session.actorId });
      const response = await fetch(`/api/v1/enrollments/${encodeURIComponent(enrollmentId)}/calendar.ics`, { headers, credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        let payload = null;
        try { payload = await response.json(); } catch { /* Calendar endpoint may not use JSON. */ }
        throw new ApiError(response.status, payload?.error || 'Не удалось подготовить календарь.');
      }
      const blob = await response.blob();
      if (!blob.size) throw new ApiError(500, 'Файл календаря оказался пустым.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `career-quest-${enrollmentId}.ics`;
      link.style.display = 'none';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      state.busy = null;
      setToast('Файл календаря скачан. Откройте его в своём календарном приложении.');
      render();
    } catch (error) {
      state.busy = null;
      setToast(error.message || 'Не удалось скачать календарь.', 'error');
      render();
    }
  }

  async function connectTelegram(enrollmentId) {
    if (!enrollmentId || state.busy) return;
    state.busy = `telegram:${enrollmentId}`;
    render();
    try {
      const response = await api('/api/enrollments', { method: 'POST', body: { careerEnrollmentId: enrollmentId, channel: 'telegram' } });
      if (!response?.telegramConnectUrl || !response?.linkExpiresAt) throw new ApiError(500, 'Сервер не вернул одноразовую ссылку Telegram.');
      state.telegramLink = { ...response, careerEnrollmentId: enrollmentId };
      state.busy = null;
      invalidateEmployeeData();
      setToast('Одноразовая ссылка Telegram готова. Она не сохранится после обновления страницы.');
      await render();
    } catch (error) {
      state.busy = null;
      setToast(error.message || 'Не удалось подключить Telegram.', 'error');
      render();
    }
  }

  async function handleAction(action, target) {
    if (action === 'logout') {
      try { window.localStorage.removeItem(SESSION_KEY); } catch { /* Storage can be unavailable; redirect still works. */ }
      redirectToSignIn();
      return;
    }
    if (action === 'retry') {
      invalidateEmployeeData();
      await render();
      return;
    }
    if (action === 'clear-catalog-search') {
      state.catalogQuery = '';
      await render();
      return;
    }
    if (action === 'enroll-session') {
      await enrollSession(target.dataset.sessionId);
      return;
    }
    if (action === 'open-cancel-dialog') {
      state.cancelTargetId = target.dataset.enrollmentId || null;
      state.cancelError = null;
      await render();
      return;
    }
    if (action === 'close-cancel-dialog') {
      state.cancelTargetId = null;
      state.cancelError = null;
      await render();
      return;
    }
    if (action === 'confirm-cancel') {
      await cancelEnrollment(target.dataset.enrollmentId);
      return;
    }
    if (action === 'download-calendar') {
      await downloadCalendar(target.dataset.enrollmentId);
      return;
    }
    if (action === 'connect-telegram') {
      await connectTelegram(target.dataset.enrollmentId);
    }
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    event.preventDefault();
    handleAction(target.dataset.action, target);
  });

  root.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'radio' || !target.dataset.activityId) return;
    state.selectedSessions.set(target.dataset.activityId, target.value);
    render();
  });

  root.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'catalog-search') return;
    event.preventDefault();
    const formData = new FormData(form);
    state.catalogQuery = String(formData.get('query') || '').trim();
    render();
  });

  if (!session) redirectToSignIn();
  else render();
})();
