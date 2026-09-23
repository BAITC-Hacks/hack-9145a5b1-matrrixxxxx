# Career Quest — мастер-промпт для завершения продукта

## Как использовать этот документ

Ты — senior product designer, UX researcher, frontend/backend engineer и QA lead. Твоя задача — превратить существующий MVP **Career Quest** в удобный внутренний сервис развития сотрудников. Работай по задачам ниже строго по порядку: сначала аудит и foundation, затем пользовательские сценарии, потом HR/manager/admin и только после этого интеграции и production hardening.

Не создавай «ещё один красивый dashboard» без рабочей логики. Каждая кнопка должна иметь понятный статус, права доступа, backend-контракт, loading/error/empty state и критерий готовности. Не делай кадровых решений автоматически: рекомендации объясняют развитие, а подтверждение результата остаётся за человеком.

---

## 1. Контекст продукта и границы

**Career Quest** — внутренний сервис компании, который помогает сотруднику понять skill gaps, выбрать развивающую активность, записаться на неё, получить напоминание, приложить evidence и получить подтверждение результата. HR управляет каталогом и программой развития. Руководитель помогает команде пройти путь. Администратор настраивает доступы и справочники.

Это **не** публичный marketplace курсов, ATS, сайт вакансий, LMS с видеохостингом или сервис принятия решений о повышении. Поэтому:

- не проектируй публичную регистрацию с паролем как основной сценарий;
- основной вход — корпоративный SSO, для demo допустим безопасный mock-role selector;
- не показывай публичные рейтинги сотрудников и не ранжируй людей;
- не повышай skill и readiness автоматически только по факту записи;
- не отправляй Telegram-сообщения без явного opt-in и привязки чата.

### Пользователи и их результаты

| Роль | Главная цель | Что должно стать проще |
| --- | --- | --- |
| Employee | Развиваться осознанно | Найти следующий шаг, записаться, не пропустить событие, подтвердить применение навыка |
| Manager | Поддержать прямых подчинённых | Видеть только свою команду, дать feedback и принять/вернуть evidence |
| HR | Управлять программой развития | Создать activity, найти аудиторию, контролировать записи, загрузку и skill gaps |
| Admin | Управлять системой | Настроить роли, справочники, интеграции, права и audit log |

---

## 2. Результаты стартового аудита: что уже есть и чего не хватает

Перед реализацией перепроверь эти наблюдения в репозитории. Не затирай уже сделанные изменения пользователя.

### Уже реализованные заготовки

- статичный responsive UI с персональным планом и демонстрационным HR-режимом;
- модели `Employee`, `Activity`, `Enrollment`, `Progress event` в development JSON store;
- development API с mock actors и базовым RBAC;
- запись на activity, отправка evidence и связь enrollment с Telegram reminder;
- Telegram reminder service и отдельный long-polling bot с `/events`, `/settings`, confirm/cancel/calendar;
- документация границ MVP и API foundation.

### Критические пробелы

1. Нет app shell с маршрутами: экран employee и HR существуют внутри одной страницы, а manager/admin не существуют как интерфейсы.
2. Нет настоящей authentication/session модели. Заголовок `x-career-quest-actor` годится только для локальной разработки и не может попасть в production.
3. Нет входной точки: landing, SSO sign-in, first-run onboarding и понятного переключения demo-ролей.
4. Нет полноценного activity catalog, отдельной activity detail page, «Мои записи», статусов, отмены, capacity/waitlist и календарного представления.
5. У activity нет обязательных product fields: дата/время, timezone, место/meeting link, capacity, owner, registration deadline, cancellation policy, audience rules и publication timestamps.
6. Нет manager workflow: очередь evidence, комментарий, approve/return, immutable progress event и пересчёт readiness.
7. HR API частично существует, но нет UI CRUD, preview, publish/archive, enrollment roster, analytics и export.
8. Нет admin UI: users/roles, skill taxonomy, role matrices, notification configuration, audit log, feature flags.
9. Временно существуют два пути Telegram updates (webhook в `server.js` и long polling в `CareerQuestRemindBot.js`). Их нельзя запускать одновременно: нужно выбрать один transport для окружения и явно это показать в документации/config.
10. Два JSON-файла и integration bridge между career enrollment и reminder enrollment подходят только для demo. Нужна единая domain model и migration plan к Postgres.
11. Нет production monitoring, rate limiting, idempotency, security headers, CSRF/session protection, structured logs, backup/retry policy и тестов end-to-end.
12. Не определены empty/loading/error/permission-denied states, accessibility behavior модалок, mobile navigation, event time zone and localization behavior.

---

## 3. Информационная архитектура и маршруты

Создай единый app shell: side navigation на desktop, bottom/compact menu на mobile, top bar с search/notifications/avatar. Навигация должна зависеть от роли, но URL должны оставаться предсказуемыми.

### Публичная зона

| Маршрут | Экран | Назначение |
| --- | --- | --- |
| `/` | Landing | Кратко объяснить ценность сервиса, безопасность и путь сотрудника; CTA «Войти через корпоративный аккаунт» |
| `/sign-in` | Вход | SSO button, fallback demo environment, help/contact; не создавать парольный signup без product decision |
| `/privacy` | Privacy | Какие данные используются, зачем, сроки хранения, контакты DPO/HR |
| `/accessibility` | Accessibility | Контакты и statement доступности |

### Employee

| Маршрут | Экран | Ключевые действия |
| --- | --- | --- |
| `/app/home` | Мой план | readiness, explainable recommendation, ближайшая запись, next action |
| `/app/catalog` | Каталог активностей | search, filters, cards/list, availability, eligibility |
| `/app/activities/:id` | Детали активности | программа, дата, место, owner, skill effect, запись/отмена/add calendar |
| `/app/enrollments` | Мои записи | upcoming/past/cancelled, Telegram state, evidence state, calendar |
| `/app/enrollments/:id` | Детали записи | timeline статуса, activity info, instructions, attach evidence, cancel |
| `/app/development-plan` | Мой маршрут | skills, target role, gaps, recommendations, history |
| `/app/notifications` | Уведомления | Telegram/email preferences, timezone, reconnect bot, delivery history |
| `/app/profile` | Профиль | non-sensitive personal data, career goal, consent/preferences |

### Manager

| Маршрут | Экран | Ключевые действия |
| --- | --- | --- |
| `/manager/team` | Моя команда | direct reports only, aggregate skill gaps, next interventions |
| `/manager/team/:employeeId` | Развитие сотрудника | профиль, plan, enrollment state, feedback history; no unrelated HR data |
| `/manager/reviews` | Evidence review queue | approve/return with mandatory constructive comment |

### HR

| Маршрут | Экран | Ключевые действия |
| --- | --- | --- |
| `/hr/overview` | HR overview | audience, capacity, attendance, completion, skill gap trends |
| `/hr/activities` | Каталог HR | list/draft/published/archived, filters, owner, date, capacity |
| `/hr/activities/new` | Создание activity | guided form, validation, preview, save draft |
| `/hr/activities/:id` | Управление activity | edit, publish, archive, roster, attendance, reminder health |
| `/hr/people` | Сотрудники | private filtered directory, aggregated view first, permission-aware detail link |
| `/hr/analytics` | Аналитика | no public ranking; cohort/filtering/export with disclosure controls |

### Admin

| Маршрут | Экран | Ключевые действия |
| --- | --- | --- |
| `/admin/overview` | System health | integration status, queue errors, audit summary |
| `/admin/users` | Users & roles | role assignments, SSO mappings, deactivate/reactivate |
| `/admin/skills` | Skill taxonomy | CRUD skill, levels, descriptions, aliases |
| `/admin/role-matrices` | Role matrices | required skill levels per role/grade, versioning |
| `/admin/integrations` | Integrations | HRIS/LMS, Telegram config status, webhook/polling mutually exclusive |
| `/admin/audit-log` | Audit log | searchable immutable record of privileged changes |

### Required universal states

For each route create: loading skeleton, empty state with a next action, expected error state with retry, 403 permission state, 404 state, responsive mobile layout and keyboard navigation. Never use a blank white section as an empty state.

---

## 4. Полная бизнес-логика

### 4.1 Authentication and authorization

1. Production uses OIDC/SAML corporate SSO. The provider returns immutable subject, work email and verified organization claim.
2. Server maps subject to internal `User`; role assignments are server-side, not inferred from client input.
3. Use secure HTTP-only session cookie or validated short-lived access token. Never authorize based on a client-supplied role header.
4. Employee may read/write only their own data. Manager may read direct reports and review only assigned reports. HR can manage program data. Admin has explicitly audited privileged operations.
5. Use `/sign-in` and `/sign-out`; redirect unauthenticated users to sign-in and unauthorized users to an explanatory 403 page.
6. Development mock auth must be isolated behind an explicit environment flag, visually labelled “Demo environment”, and impossible to enable in production.

### 4.2 Activity lifecycle

Activity statuses: `draft → published → archived`. An event occurrence is separate from a reusable activity template.

Required entities:

```text
ActivityTemplate(id, title, description, skillImpact, format, ownerId,
  eligibilityRules, status, createdAt, updatedAt)
ActivityOccurrence(id, activityTemplateId, startsAt, endsAt, timezone,
  locationType, locationValue, capacity, registrationDeadline, status)
```

- HR creates a draft; form validation blocks publication when dates, capacity, owner or eligibility are incomplete.
- Published activity is visible only to eligible employees.
- Archive preserves historic records but prevents new enrollment.
- An occurrence can be cancelled; all enrolled employees receive a notification and a visible in-app message.
- Use a canonical UTC timestamp and persist the IANA timezone. Render in employee timezone with a clear label.

### 4.3 Enrollment and attendance lifecycle

```text
eligible → enrollment_requested → enrolled → confirmed → in_progress
→ evidence_submitted → needs_revision | verified → completed

side exits: waitlisted, cancelled_by_employee, cancelled_by_hr, no_show
```

- Check eligibility, deadline, occurrence state, capacity and duplicate active enrollment atomically on the server.
- When capacity is full, offer waitlist rather than an ambiguous error.
- Employee can cancel before the policy deadline; HR cancellation explains reason and triggers notification.
- “Add to calendar” creates ICS/Google/Outlook link from server-generated canonical occurrence data.
- Attendance is updated by HR/owner, not inferred from reminder delivery.
- Evidence requires text/link/file metadata, timestamp and a confirmation that the employee may share it.
- Review has two outcomes: `verified` or `needs_revision`, both with comment. Verification creates immutable `ProgressEvent`; only then recompute skill/readiness using a versioned rule.

### 4.4 Recommendations and explainability

- Recommendation includes `reason`, `input snapshot`, `algorithm/rule version`, `createdAt`, `expiresAt`, and alternative activities.
- Show a human-readable explanation: current skill level, target requirement, relevance to role and expected evidence.
- Do not use protected attributes, hidden performance data or opaque ranking.
- Employee can dismiss/mark “not relevant” and provide reason; this becomes a product signal, not a penalty.
- Show uncertainty honestly: “suggested next step”, never “you must be promoted/not promoted”.

### 4.5 Notification logic

- Notification preferences are scoped per person and per channel (`telegram`, `email`, `in_app`) and require opt-in.
- Telegram account linking uses an opaque single-use, short-expiry token. Store only stable chat ID required for delivery, restrict visibility, and allow disconnect.
- Reminder schedule default: 7d, 24h, 1h. Employee may disable selected stages if policy allows.
- Use a durable notification job with idempotency key `{enrollmentId}:{reminderStage}`; failed delivery retries with exponential backoff and surfaces in admin health.
- Reminder CTA buttons: confirm, add calendar, cancel (when policy permits). Callback must re-authorize ownership server-side.
- Choose exactly one Telegram transport per environment: webhook in production **or** long polling in local demo. Enforce config validation so both cannot start.
- Never log bot token, start-link tokens, raw chat messages or credentials.

### 4.6 Analytics and privacy

- HR overview defaults to aggregate data and minimum cohort threshold; do not expose a single employee from “anonymous” aggregates.
- Attendance, enrollment, completion, reminder delivery and skill-gap trends are distinct metrics.
- Exports require HR permission, a reason/audit event, CSV formula-injection protection and documented retention.
- Audit privileged actions: role change, activity publish/archive, activity cancellation, review decision, integration setting, export, access to employee detail.

---

## 5. Data model and API requirements

Move from JSON demo persistence to PostgreSQL before production. Keep migrations reversible and use a transaction for multi-record state changes. Minimum tables:

```text
users, employees, teams, manager_assignments,
skills, role_matrices, employee_skills,
activity_templates, activity_occurrences, activity_eligibility,
enrollments, enrollment_status_history, evidence, reviews,
progress_events, recommendations, notification_preferences,
notification_jobs, notification_deliveries, integration_connections,
audit_log
```

Essential API namespaces:

```text
GET    /api/me
GET    /api/catalog/activities
GET    /api/activities/:id
POST   /api/occurrences/:id/enrollments
PATCH  /api/enrollments/:id/cancel
POST   /api/enrollments/:id/evidence
GET    /api/me/enrollments
PATCH  /api/me/notification-preferences

GET    /api/manager/reviews
POST   /api/manager/reviews/:id/decision

GET    /api/hr/activities
POST   /api/hr/activities
PATCH  /api/hr/activities/:id
POST   /api/hr/occurrences/:id/cancel
GET    /api/hr/analytics

GET    /api/admin/audit-log
PATCH  /api/admin/users/:id/roles
```

For every mutation require: authenticated actor, authorization policy, request validation, idempotency policy where retry is possible, atomic update, audit event, structured response and test coverage. Error payloads follow one shape: `{ code, message, fieldErrors?, requestId? }`.

---

## 6. Design direction: calm, clear, trustworthy and fast

### Design principles

1. **Next action over data overload.** Every page opens with “what should I do next?”
2. **Explain, don’t judge.** Skill gaps are opportunities with context, never red flags.
3. **Progress is tangible.** Use timeline/status chips and evidence path, not gamified pressure.
4. **Information hierarchy is role-specific.** Employee sees self; manager sees team; HR sees program; admin sees system.
5. **Dense when needed, quiet by default.** HR tables can be compact, but employee screens should breathe.

### Visual system

- Preserve the current midnight navy / fresh lime / soft white personality, but promote them into semantic tokens: `surface`, `surfaceRaised`, `textPrimary`, `textSecondary`, `brand`, `success`, `warning`, `danger`, `focus`.
- Use one neutral font family, 4–5 text sizes, an 8px spacing scale, radius 12/16/24, and subtle elevation only for interactive surfaces.
- Never communicate status by color alone: pair color with icon and text. Maintain WCAG AA contrast, including lime-on-white cases.
- Use a 12-column desktop grid, 8-column tablet, 4-column mobile. Content max width around 1280–1440px.
- Desktop side nav: brand, primary role navigation, bottom help/profile. Mobile: compact top bar and an accessible navigation sheet.
- Cards: concise title, one key metric, secondary copy and explicit action. Avoid five equally loud CTAs.
- Tables: sticky headers, filter summary, pagination/virtualization plan, row actions in overflow menu, empty and error states.
- Charts: provide text summary and data table alternative; never make a decision dependent on a color-only chart.

### Key screens in detail

**Landing:** clear headline (“Развитие, которое превращается в следующий уверенный шаг”), 3-step explainer, role benefits, privacy note, SSO CTA, no fake public testimonials.

**Employee home:** greeting, readiness summary, top recommendation with explanation, a “next scheduled event” card, action queue (connect Telegram, submit evidence), short timeline, no HR metrics.

**Catalog:** search first, meaningful filters (skill, format, date, duration, availability), cards with visible date/time and eligibility, optional list toggle. Show why an activity is unavailable instead of hiding it silently when it helps understanding.

**Activity detail:** hero with status and date; objectives, agenda, skill impact, owner, format, location, capacity, prerequisites, cancellation policy, enrollment CTA. Sticky CTA on mobile.

**My enrollments:** tabs Upcoming / In progress / History, status timeline, time zone, calendar CTA, reminder chip, evidence action; empty state leads to catalog.

**Manager reviews:** priority queue with employee, activity, submitted time and concise evidence excerpt; side panel or detail view with structured approve/return action; comment required when returning.

**HR activity editor:** progressive form sections: basics → schedule → audience → impact → publishing. Autosave draft indicator, field validation beside field, preview before publish, dangerous archive/cancel confirmation.

**Admin:** deliberately utilitarian, clear warnings for security-sensitive configuration, audit table with actor/action/object/time/request ID.

### Accessibility and UX quality bar

- Semantic landmarks, labelled inputs, visible keyboard focus, skip link, focus trap and focus return for dialogs.
- All actions reachable with keyboard; no hover-only controls; respect `prefers-reduced-motion`.
- Form error appears in text near field and in a live summary; preserve values after server validation failure.
- Loading screens use skeletons only when content shape is known; otherwise clear progress text. Never simulate completion.
- Localize all user-visible strings to Russian initially; format dates, plural forms and timezone correctly.

---

## 7. Ordered implementation backlog

Do not jump to later tasks until acceptance criteria of the current task pass. Log deviations and update this document if the scope changes.

### Task 0 — Baseline and audit (must be done first)

**Deliverables**

- inventory of current routes/UI/API/data and user-owned uncommitted changes;
- architecture decision record: internal SSO service, chosen Telegram transport, persistence approach;
- dependency/security audit; baseline screenshots and test command output.

**Acceptance criteria:** no existing user change overwritten; current smoke tests pass; known risks are documented.

### Task 1 — Application foundation and access model

**Build**

- app shell, named routes or a small client-side router, role-aware nav, 404/403 states;
- landing, sign-in/demo selector, sign-out and a clearly visible Demo label;
- typed/authenticated session boundary in backend design; preserve mock auth only under a development flag;
- design tokens and common components: button, badge, empty state, error state, modal, page header, data table shell.

**Acceptance criteria:** each role can enter only its allowed surface; refresh retains or safely restores session; mobile nav and keyboard navigation work; no role is selected merely by client UI state in production mode.

### Task 2 — Employee event journey

**Build**

- catalog, activity details, occurrence/date model, My enrollments and enrollment details;
- enrollment, cancellation, capacity/waitlist and add-to-calendar; success/error state for every mutation;
- notification preferences and Telegram linking screen.

**Acceptance criteria:** employee can find an eligible occurrence, enroll once, see it in My enrollments, cancel under policy, and complete Telegram linking without exposing token; ineligible/capacity-full state is clear.

### Task 3 — Evidence and manager review

**Build**

- evidence form/history, manager team overview, review queue, approve/return workflow, progress events and recommendation refresh.

**Acceptance criteria:** employee cannot review themself; manager cannot access non-reports; returning evidence requires comment; verification creates one immutable progress event and a repeat request is idempotent.

### Task 4 — HR program management

**Build**

- activity template/occurrence CRUD, guided editor, publish/archive/cancel, roster, attendance, HR dashboard and safe export.

**Acceptance criteria:** draft never leaks to employee catalog; activity publish validates all essentials; cancellation notifies affected participants; HR filters and analytics do not expose data outside authorization.

### Task 5 — Admin governance

**Build**

- users/roles, skill taxonomy, role matrices, integrations, notification health and audit log.

**Acceptance criteria:** every privileged change creates an audit record; settings screen does not leak tokens; role change takes effect predictably; dangerous actions require confirmation.

### Task 6 — Productionize integrations and persistence

**Build**

- Postgres migrations, background queue, one Telegram transport per environment, retries/dead letter handling, observability, backups and secrets management;
- SSO integration and real identity mapping.

**Acceptance criteria:** no JSON store is relied on in production; background delivery is idempotent; failed delivery is observable and recoverable; secrets never appear in response/log/repository.

### Task 7 — Quality, security and rollout

**Build**

- unit/API/integration/e2e tests, accessibility audit, performance pass, penetration checklist, consent/privacy review, feature flags and pilot rollout plan.

**Acceptance criteria:** critical flows pass e2e; keyboard/screen-reader smoke pass; authorization tests cover all roles; a rollback and support runbook exist.

---

## 8. Mandatory self-audit after every task

Before declaring a task complete, answer all of these with evidence:

1. What user outcome is now possible that was not possible before?
2. What roles can perform the action, and what blocks everyone else?
3. What happens on loading, no data, validation error, network error and refresh?
4. Does the server validate and authorize the action independently from the UI?
5. Are timestamps/timezones, status transitions, cancellation and duplicate retries safe?
6. Is the UI keyboard accessible and usable on a 360px screen?
7. Does it expose personal data, secrets, chat IDs or role data unnecessarily?
8. Did tests cover success, rejection and conflict paths?
9. Did any existing uncommitted user change overlap? If yes, stop and ask rather than overwrite.
10. Are docs, API contract and UI behavior consistent?

## 9. Expected format of each implementation response

For each task, report only:

1. Outcome delivered.
2. Files changed and why.
3. Validation performed and result.
4. Remaining risks or decisions that require the product owner.

Start with **Task 0**, then implement **Task 1**. Do not skip audit or invent external credentials. Use production-safe defaults and leave token/SSO configuration to environment variables.
