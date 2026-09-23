# Career Quest API v1 — foundation

Это development API для выделения домена Career Quest из статического UI. Оно выключено по умолчанию: задайте `CAREER_QUEST_DEV_AUTH=true` только локально. Каждый запрос должен передавать `x-career-quest-actor`; это временный локальный механизм, а не production authentication.

Доступные локальные actors: `U_EMPLOYEE_E0028`, `U_MANAGER_BACKEND`, `U_HR_DEVELOPMENT`, `U_ADMIN_PLATFORM`.

## `GET /api/v1/bootstrap?employeeId=E0028`

Возвращает профиль сотрудника, доступные ему опубликованные activities, его enrollments и progress events. Employee получает только собственный профиль; manager — только прямых подчинённых; HR/Admin — все профили.

## `GET /api/v1/activities?employeeId=E0028`

Возвращает только опубликованные activities, соответствующие роли и grade указанного сотрудника.

## HR catalog

`GET /api/v1/hr/activities`, `POST /api/v1/activities` и `PATCH /api/v1/activities/:id` доступны только локальным actors с ролью `hr` или `admin`.

Новая activity создаётся в статусе `draft`. HR публикует её отдельным `PATCH` с `{ "status": "published" }`; допустимые статусы — `draft`, `published`, `archived`.

## `POST /api/v1/enrollments`

Создаёт enrollment в статусе `enrolled`.

```json
{ "employeeId": "E0028", "activityId": "ACT_SYSTEM_DESIGN_LAB" }
```

Возвращает `201`. Повторная активная запись возвращает `409`; нарушение eligibility — `403`.

## `POST /api/v1/enrollments/:id/evidence`

Переводит enrollment из `enrolled`/`in_progress` в `submitted` и сохраняет evidence.

```json
{ "evidence": "Ссылка на результат или краткое описание" }
```

Подтверждение менеджером и создание progress event будут добавлены после authentication/RBAC.
