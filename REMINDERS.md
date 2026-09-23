# Напоминания о мероприятиях

Сервис уже связан с интерфейсом: пользователь нажимает «Записаться и включить напоминания», указывает время мероприятия, а сервер создаёт запись и одноразовую Telegram-ссылку.

## Запуск

1. Скопируйте `.env.example` в `.env` и укажите токен и username Telegram-бота, созданного через `@BotFather`.
2. Запустите `node server.js`.
3. Откройте `http://localhost:4173`, создайте запись и в открывшемся Telegram-боте нажмите **Start**.

## Настройка Telegram webhook

После публикации сервиса на URL с HTTPS выполните запрос (подставьте свои значения):

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

`/start <одноразовый-токен>` привязывает чат Telegram к конкретной записи. Токен уничтожается сразу после привязки.

## Планировщик

Вызывайте `POST https://<YOUR_DOMAIN>/api/reminders/run` с заголовком `x-cron-secret: <CRON_SECRET>` не реже одного раза в 5 минут. Подойдут Vercel Cron, GitHub Actions, Cloud Scheduler или корпоративный scheduler. Сервис отправляет уведомления за 7 дней, 24 часа и 1 час, хранит отправленные этапы, чтобы не было дублей, и при пропуске запуска выбирает только самое актуальное напоминание.

Для локальной проверки:

```powershell
Invoke-WebRequest -Method POST http://localhost:4173/api/reminders/run -Headers @{ 'x-cron-secret' = '<CRON_SECRET>' }
```

## Ограничения MVP

Хранилище — локальный JSON-файл `data/reminder-store.json`, чтобы запуск не требовал npm или базы данных. Для production замените его на PostgreSQL, добавьте корпоративную аутентификацию и шифрование персональных данных.
