# Career Quest API v1 — foundation

Это development API для выделения домена Career Quest из статического UI. Оно выключено по умолчанию: задайте `CAREER_QUEST_DEV_AUTH=true` только локально. Каждый запрос должен передавать `x-career-quest-actor`; это временный локальный механизм, а не production authentication.

Доступные локальные actors: `U_EMPLOYEE_E0028`, `U_MANAGER_BACKEND`, `U_HR_DEVELOPMENT`, `U_ADMIN_PLATFORM`.

## `GET /api/v1/bootstrap?employeeId=E0028`

Возвращает профиль сотрудника, доступные ему опубликованные activities, их канонические `sessions`, его enrollments (с вложенными `activity` и `session`) и progress events. Employee получает только собственный профиль; manager — только прямых подчинённых; HR/Admin — все профили.

## `GET /api/v1/activities?employeeId=E0028`

Возвращает только опубликованные activities, соответствующие роли и grade указанного сотрудника. У каждой activity есть вычисляемый список `sessions` с расписанием, местами и доступностью.

## Сессия activity

`GET /api/v1/activities/:activityId?employeeId=E0028` возвращает доступную сотруднику activity и её сессии. Источник истины для записи — именно `session`: `startsAt`, `endsAt`, `timezone`, место, вместимость и дедлайны не принимаются от браузера.

## HR catalog

`GET /api/v1/hr/activities`, `POST /api/v1/activities` и `PATCH /api/v1/activities/:id` доступны только локальным actors с ролью `hr` или `admin`.

Новая activity создаётся в статусе `draft`. HR публикует её отдельным `PATCH` с `{ "status": "published" }`; допустимые статусы — `draft`, `published`, `archived`.

## `POST /api/v1/sessions/:sessionId/enrollments`

Создаёт личную запись сотрудника на конкретную сессию. `employeeId` сервер выводит из development actor; тело не требуется и не может сменить владельца записи.

Если места есть, результат имеет статус `enrolled`; при заполненной сессии с включённым листом ожидания — `waitlisted`. Повторная активная запись на эту же сессию возвращает `409`; нарушение eligibility — `403`.

`POST /api/v1/enrollments` остаётся совместимым alias и принимает только:

```json
{ "sessionId": "SES_SYSTEM_DESIGN_OCT" }
```

`activityId`, дата, часовой пояс и `employeeId` из тела игнорируются или не принимаются: activity выводится из session, а сотрудник — из actor.

## Мои записи, отмена и календарь

- `GET /api/v1/me/enrollments` возвращает только записи текущего сотрудника.
- `PATCH /api/v1/enrollments/:id/cancel` доступен только владельцу до `cancellationDeadline`. Освобождённое место получает первый сотрудник из листа ожидания; повторная отмена идемпотентна.
- `GET /api/v1/enrollments/:id/calendar.ics` доступен только владельцу и возвращает `text/calendar` с `DTSTART`/`DTEND` канонической сессии. В development UI файл загружается через `fetch` с actor header, а не через открытую ссылку.

## `POST /api/v1/enrollments/:id/evidence`

Переводит enrollment из `enrolled`, `confirmed` или `in_progress` в `submitted` и сохраняет evidence.

## Проверка результатов

`GET /api/v1/reviews` возвращает результаты в статусе `submitted`: manager видит только прямых подчинённых, HR и admin — всю очередь. `GET /api/v1/reviews?scope=history` возвращает решения `verified` и `revision` в той же области доступа.

`POST /api/v1/enrollments/:id/review` доступен manager прямого подчинённого, HR и admin. Тело запроса:

```json
{ "decision": "verified", "comment": "Хорошо раскрыты компромиссы и сценарий масштабирования." }
```

Допустимые решения — `verified` и `revision`; комментарий обязателен (от 10 символов). При `verified` сервер один раз увеличивает связанный навык в рамках 5 уровней, пересчитывает readiness по временной MVP-формуле и сохраняет неизменяемый `progressEvent`. Повторная проверка возвращает `409`.

```json
{ "evidence": "Ссылка на результат или краткое описание" }
```

## Связь с Telegram reminders

После успешного `POST /api/v1/enrollments` интерфейс создаёт Telegram reminder через существующий `POST /api/enrollments` и передаёт `careerEnrollmentId`. Reminder record сохраняет эту связь, а Career Quest enrollment получает `reminderEnrollmentId`. Это временный integration bridge до переноса reminder service в основное хранилище.

На `/telegram.html` размещены инструкция и форма выдачи ссылки. Ссылки не хранятся в браузере; повторное открытие страницы позволяет выпустить новый код для той же записи.

- `GET /api/telegram/enrollments` — собственные напоминания сотрудника: `{ enrollments: [...] }`. Возвращает статус, `connected` и `linkExpiresAt`; без chat ID, токена и URL привязки.
- `POST /api/enrollments` — создаёт напоминание для существующей серверной записи на сессию. Тело: `careerEnrollmentId`, `channel: "telegram"`. Название, расписание и часовой пояс берутся из серверной сессии. Ответ `201`: `{ id, telegramConnectUrl, linkExpiresAt }`.
- `POST /api/telegram/enrollments/:id/link` — перевыпускает одноразовую ссылку на 24 часа, аннулируя прежнюю. `:id` — ID напоминания. Ответ `200` того же формата; новые записи не создаются.

Эти операции доступны только сотруднику-владельцу. Чужая запись/служебная роль — `403`, отсутствующая запись — `404`, уже подключённое, отменённое или начавшееся мероприятие при перевыпуске — `409`, выключенный или ненастроенный Telegram при выдаче — `503`. Открытие сайта само по себе не выпускает код и не подписывает на уведомления.
