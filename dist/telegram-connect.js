(() => {
  'use strict';

  const profile = document.getElementById('telegram-profile');
  const form = document.getElementById('telegram-form');
  const fields = document.getElementById('telegram-fields');
  const activity = document.getElementById('telegram-session');
  const service = document.getElementById('telegram-service');
  const error = document.getElementById('telegram-error');
  const result = document.getElementById('telegram-result');
  const connections = document.getElementById('telegram-connections');
  const refresh = document.getElementById('telegram-refresh');
  const available = document.getElementById('telegram-available-session');
  const book = document.getElementById('telegram-book');
  const bookingNote = document.getElementById('telegram-booking-note');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let data;
  let reminders = [];
  let currentLink;
  let loading = false;
  let revision = 0;
  const allowedProfiles = Array.from(profile.options, option => option.value);
  // Reuse only the selected synthetic employee, never a link or Telegram ID.
  try {
    const selected = JSON.parse(localStorage.getItem('career-quest-design-v3') || 'null')?.profile;
    const previous = JSON.parse(localStorage.getItem('careerQuestDemoSession') || 'null')?.employeeId;
    if (allowedProfiles.includes(selected || previous)) profile.value = selected || previous;
  } catch { /* The page works even when browser storage is unavailable. */ }

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function formatDate(value, zone = timezone) {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(value));
  }
  async function api(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { 'x-career-quest-actor': `U_EMPLOYEE_${profile.value}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }).catch(() => { throw new Error('Не удалось связаться с сервисом. Проверьте соединение и повторите попытку.'); });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Сервис подключения Telegram сейчас недоступен. Попробуйте позже.'); }
    if (!response.ok) {
      if (payload.code === 'CAREER_API_DISABLED') throw new Error('Подключение пока недоступно на этом сайте. Обратитесь к администратору Career Quest.');
      throw new Error(payload.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.');
    }
    return payload;
  }
  function setBusy(value) {
    loading = value;
    profile.disabled = value;
    refresh.disabled = value;
    fields.disabled = value || !data || !activity.options.length;
    available.disabled = value || !data || !available.options.length;
    book.disabled = available.disabled;
    connections.querySelectorAll('button').forEach(button => { button.disabled = value; });
  }
  function clearLink() { currentLink = null; result.replaceChildren(); result.hidden = true; }
  function showLink(link) {
    const url = new URL(link.telegramConnectUrl);
    if (url.protocol !== 'https:' || url.hostname !== 't.me' || !url.searchParams.get('start')) throw new Error('Сервис не вернул ссылку для Telegram. Попробуйте получить новую.');
    currentLink = link;
    const title = node('h3', 'Ваша одноразовая ссылка готова');
    const text = node('p', `Откройте бота и нажмите Start / «Запустить». Ссылка действует до ${formatDate(link.linkExpiresAt)} (${timezone}).`);
    const input = node('input', undefined, 'tg-link-input');
    input.type = 'text'; input.readOnly = true; input.value = url.href;
    input.setAttribute('aria-label', 'Одноразовая ссылка для подключения Telegram');
    input.addEventListener('click', () => input.select());
    const open = node('a', 'Открыть Telegram ↗', 'tg-button tg-primary');
    open.href = url.href; open.target = '_blank'; open.rel = 'noopener noreferrer';
    open.addEventListener('click', event => {
      if (Date.now() >= Date.parse(link.linkExpiresAt)) { event.preventDefault(); showError('Срок ссылки истёк. Нажмите «Получить новую ссылку» у мероприятия.'); clearLink(); }
    });
    const copy = node('button', 'Скопировать ссылку', 'tg-button'); copy.type = 'button';
    copy.addEventListener('click', async () => {
      if (Date.now() >= Date.parse(link.linkExpiresAt)) { clearLink(); showError('Срок ссылки истёк. Получите новую ссылку у мероприятия.'); return; }
      try { await navigator.clipboard.writeText(url.href); copy.textContent = 'Ссылка скопирована'; }
      catch { input.focus(); input.select(); copy.textContent = 'Скопируйте выделенный текст'; }
    });
    const actions = node('div', undefined, 'tg-result-actions'); actions.append(open, copy);
    result.replaceChildren(title, text, input, actions, node('p', 'Обычная ссылка на бота без персонального кода не подключает мероприятие.'));
    result.hidden = false; result.tabIndex = -1; result.focus();
  }
  function renderConnections() {
    connections.replaceChildren();
    if (!reminders.length) connections.append(node('p', 'Подключений пока нет. Выберите мероприятие и получите ссылку — оно появится здесь.', 'tg-muted'));
    for (const reminder of reminders) {
      const item = node('article', undefined, 'tg-connection');
      const ended = Date.parse(reminder.occursAt) <= Date.now();
      const inactive = reminder.status === 'cancelled' || ended;
      const label = reminder.status === 'cancelled' ? 'Запись отменена' : ended ? 'Мероприятие прошло' : reminder.connected ? 'Подключено' : Date.parse(reminder.linkExpiresAt) <= Date.now() ? 'Ссылка истекла' : 'Ожидает подключения';
      item.append(node('h3', reminder.activityTitle), node('span', label, `tg-state${reminder.connected && !inactive ? ' tg-state-connected' : ''}`), node('p', `${formatDate(reminder.occursAt, reminder.timezone)} · ${reminder.timezone}`));
      if (!inactive && !reminder.connected) {
        const renew = node('button', 'Получить новую ссылку', 'tg-button tg-quiet'); renew.type = 'button';
        renew.addEventListener('click', async () => {
          if (loading) return;
          setBusy(true); showError(''); clearLink();
          try {
            const link = await api(`/api/telegram/enrollments/${encodeURIComponent(reminder.id)}/link`, {});
            reminder.linkExpiresAt = link.linkExpiresAt;
            renderConnections(); showLink(link);
          } catch (failure) { showError(failure.message); }
          finally { setBusy(false); }
        });
        item.append(renew, node('p', 'Новая ссылка заменит предыдущую. Запись на мероприятие сохранится.'));
      }
      connections.append(item);
    }
    if (currentLink && reminders.some(reminder => reminder.id === currentLink.id && (reminder.connected || reminder.status === 'cancelled'))) clearLink();
  }
  function fillActivities(preferred) {
    activity.replaceChildren();
    const choices = data.enrollments.filter(item => {
      if (!['enrolled', 'confirmed'].includes(item.status)) return false;
      const scheduled = item.session;
      if (!scheduled || scheduled.status !== 'scheduled' || Date.parse(scheduled.startsAt) <= Date.now() || ['closed', 'cancelled'].includes(scheduled.availability)) return false;
      return !reminders.some(reminder => reminder.careerEnrollmentId === item.id);
    });
    for (const item of choices) {
      const title = item.activity?.title || data.activities.find(entry => entry.id === item.activityId)?.title || 'Мероприятие';
      const option = node('option', `${title} · ${formatDate(item.session.startsAt, item.session.timezone)}`);
      option.value = item.id; activity.append(option);
    }
    if (choices.some(item => item.id === preferred)) activity.value = preferred;
    showSchedule();
    fields.disabled = !choices.length;
    fields.hidden = !choices.length;
    service.hidden = choices.length > 0;
    if (!choices.length) service.textContent = reminders.length ? 'Все доступные записи уже показаны в «Моих подключениях». Для неподключённой записи получите новую ссылку там.' : 'Пока нет записей для подключения. Откройте «Выбрать сессию» ниже и запишитесь на мероприятие. Для листа ожидания сначала нужно подтверждение места.';
    available.replaceChildren();
    for (const scheduled of data.sessions || []) {
      if (scheduled.availability !== 'open' || scheduled.status !== 'scheduled' || Date.parse(scheduled.startsAt) <= Date.now()) continue;
      if (data.enrollments.some(item => item.sessionId === scheduled.id && item.status !== 'cancelled')) continue;
      const title = data.activities.find(item => item.id === scheduled.activityId)?.title || 'Мероприятие';
      const option = node('option', `${title} · ${formatDate(scheduled.startsAt, scheduled.timezone)} · ${scheduled.timezone}`);
      option.value = scheduled.id; available.append(option);
    }
    bookingNote.textContent = available.options.length ? 'Расписание и доступность мест задаёт организатор.' : 'Сейчас нет свободных сессий для новой записи. Обновите статус позже.';
  }
  function showSchedule() {
    const selected = data?.enrollments.find(item => item.id === activity.value)?.session;
    document.getElementById('telegram-session-detail').textContent = selected ? `${formatDate(selected.startsAt, selected.timezone)} · ${selected.timezone}${selected.locationValue ? ' · ' + selected.locationValue : ''}` : 'Дата, место и часовой пояс появятся после выбора.';
  }
  async function load() {
    if (loading) return;
    const requestRevision = ++revision;
    const selectedActivity = activity.value || new URLSearchParams(location.search).get('enrollmentId');
    setBusy(true); showError('');
    try {
      const [health, bootstrap, linked] = await Promise.all([api('/api/health'), api(`/api/v1/bootstrap?employeeId=${encodeURIComponent(profile.value)}`), api('/api/telegram/enrollments')]);
      if (requestRevision !== revision) return;
      if (!health.telegramConfigured) throw new Error('Подключение Telegram пока недоступно. Администратору нужно включить сервис бота.');
      data = bootstrap; reminders = linked.enrollments;
      if (!Array.isArray(data.activities) || !Array.isArray(data.enrollments) || !Array.isArray(reminders)) throw new Error('Не удалось загрузить мероприятия. Попробуйте обновить статус.');
      fillActivities(selectedActivity); renderConnections();
      if (currentLink && Date.parse(currentLink.linkExpiresAt) <= Date.now()) clearLink();
    } catch (failure) {
      data = null; clearLink();
      service.hidden = false;
      service.textContent = 'Получить ссылку сейчас не удалось. Инструкция доступна; подключение можно повторить кнопкой «Обновить статус».';
      showError(failure.message);
      connections.replaceChildren(node('p', 'Статус подключения пока недоступен.', 'tg-muted'));
    } finally { setBusy(false); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (loading || !data || !form.reportValidity()) return;
    const selectedEnrollmentId = activity.value;
    setBusy(true); showError(''); clearLink();
    try {
      // Only server enrollments are used. Browser-only demo records cannot
      // create a link. No token is generated or persisted in browser storage.
      data = await api(`/api/v1/bootstrap?employeeId=${encodeURIComponent(profile.value)}`);
      const enrollment = data.enrollments.find(item => item.id === selectedEnrollmentId);
      if (!enrollment || !['enrolled', 'confirmed'].includes(enrollment.status)) throw new Error('Эта запись больше недоступна для подключения. Обновите статус.');
      const selected = enrollment.session;
      if (!selected || Date.parse(selected.startsAt) <= Date.now()) throw new Error('Мероприятие уже началось или недоступно. Выберите другую запись.');
      const linked = await api('/api/telegram/enrollments');
      reminders = linked.enrollments;
      const existing = reminders.find(item => item.careerEnrollmentId === enrollment.id);
      let link;
      if (existing) {
        if (existing.connected) { fillActivities(); renderConnections(); service.hidden = false; service.textContent = 'Telegram уже подключён к этой записи.'; return; }
        link = await api(`/api/telegram/enrollments/${encodeURIComponent(existing.id)}/link`, {});
        existing.linkExpiresAt = link.linkExpiresAt;
      } else {
        link = await api('/api/enrollments', { careerEnrollmentId: enrollment.id, channel: 'telegram' });
        // A minimal local view is enough if refreshing the list fails later.
        reminders.push({ id: link.id, careerEnrollmentId: enrollment.id, activityTitle: enrollment.activity?.title || data.activities.find(item => item.id === enrollment.activityId)?.title || 'Мероприятие', occursAt: selected.startsAt, timezone: selected.timezone, status: 'active', connected: false, linkExpiresAt: link.linkExpiresAt });
      }
      fillActivities(); renderConnections(); showLink(link);
    } catch (failure) { showError(failure.message); }
    finally { setBusy(false); }
  });
  activity.addEventListener('change', showSchedule);
  document.getElementById('telegram-booking-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (loading || !data || !available.value || !event.currentTarget.reportValidity()) return;
    setBusy(true); showError('');
    try {
      const { enrollment } = await api('/api/v1/enrollments', { sessionId: available.value });
      data = await api(`/api/v1/bootstrap?employeeId=${encodeURIComponent(profile.value)}`);
      fillActivities(enrollment.id);
      if (enrollment.status === 'waitlisted') {
        bookingNote.textContent = 'Свободные места закончились: вы в листе ожидания. Ссылка станет доступна после подтверждения места.';
      } else {
        document.getElementById('telegram-booking').open = false;
        service.hidden = false; service.textContent = 'Вы записаны. Теперь подтвердите получение напоминаний и получите одноразовую ссылку.';
        document.getElementById('telegram-consent').checked = false;
        activity.focus();
      }
    } catch (failure) { showError(failure.message); }
    finally { setBusy(false); }
  });
  profile.addEventListener('change', () => { clearLink(); reminders = []; document.getElementById('telegram-consent').checked = false; load(); });
  refresh.addEventListener('click', load);
  window.addEventListener('focus', () => { if (currentLink && !loading) load(); });
  load();
})();
