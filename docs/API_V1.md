# Career Quest API v1 — foundation

Это development API для выделения домена Career Quest из статического UI. До задачи RBAC он не должен быть доступен из публичной сети и не является production contract.

## `GET /api/v1/bootstrap?employeeId=E0028`

Возвращает профиль сотрудника, доступные ему опубликованные activities, его enrollments и progress events. Используется для первого server-backed employee dashboard.

## `GET /api/v1/activities?employeeId=E0028`

Возвращает только опубликованные activities, соответствующие роли и grade указанного сотрудника.

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
