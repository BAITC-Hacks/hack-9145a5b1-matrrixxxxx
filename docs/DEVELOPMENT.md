# Локальный запуск Career Quest

Для текущего MVP используйте сервер, а не прямое открытие HTML-файла: API, защищённые demo-маршруты и client-side deep links требуют HTTP.

```powershell
node server.js
```

После запуска:

| URL | Назначение |
| --- | --- |
| `http://localhost:4173/` | Landing |
| `http://localhost:4173/sign-in` | Вход и явно помеченный demo-контур |
| `http://localhost:4173/app/home` | Пространство сотрудника |
| `http://localhost:4173/manager/team` | Пространство руководителя |
| `http://localhost:4173/hr/overview` | Пространство HR |
| `http://localhost:4173/admin/overview` | Пространство администратора |
| `http://localhost:4173/legacy-demo` | Предыдущая цельная версия dashboard, сохранённая для сравнения |

## Demo access

Для просмотра development API в `.env` локально задайте:

```text
CAREER_QUEST_DEV_AUTH=true
TELEGRAM_TRANSPORT=polling
```

Demo selector сохраняет выбранную роль только в local storage браузера и не является production authentication. В production сервер завершит работу, если `NODE_ENV=production` сочетается с `CAREER_QUEST_DEV_AUTH=true`.

## Telegram

- `TELEGRAM_TRANSPORT=polling`: запустите `CareerQuestRemindBot.js` отдельно для локальной разработки.
- `TELEGRAM_TRANSPORT=webhook`: используйте webhook `server.js` и защищённый scheduler; не запускайте polling-процесс одновременно.

Дальнейшие продуктовые задачи и критерии готовности находятся в [MASTER_PRODUCT_PROMPT.md](MASTER_PRODUCT_PROMPT.md).
