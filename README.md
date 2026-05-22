# Apartment Project

Монорепозиторий с двумя основными приложениями:

- `web-panel` — админ-панель на Next.js для управления городами, районами и квартирами
- `ApartmentBot` — Telegram-бот на .NET 10, который работает поверх API панели

## Состав проекта

```text
Apartment project/
├── web-panel/              # Next.js admin panel
├── ApartmentBot/           # .NET Telegram bot
├── docker-compose.yml      # Общий стек: panel + bot + postgres + redis
├── .env.docker.example     # Шаблон переменных для Docker
└── UpdateFile.md           # Дорожная карта и журнал обновления проекта
```

## Быстрый запуск

### Документация запуска и проверок

- [docs/operations.md](/C:/Repository/Apartment%20project/docs/operations.md) — локальный запуск, env vars, миграции, PDF import, диагностика и CI.
- [docs/quality-checklist.md](/C:/Repository/Apartment%20project/docs/quality-checklist.md) — короткий checklist для PR и локальной проверки.
- [.github/workflows/ci.yml](/C:/Repository/Apartment%20project/.github/workflows/ci.yml) — GitHub Actions checks без Docker build.

### Весь стек через Docker вручную

1. Скопируйте [.env.docker.example](/C:/Repository/Apartment%20project/.env.docker.example) в `.env`
2. Заполните минимум:
   - `ADMIN_LOGIN`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `TELEGRAM_BOT_TOKEN`
   - при необходимости `TELEGRAM_MANAGER_CHAT_ID`
3. Запустите:

```bash
docker compose up --build
```

Docker build сейчас считается отдельным ручным шагом и не входит в обязательные CI-проверки.

После старта будут доступны:

- `web-panel`: `http://localhost:3000`
- `PostgreSQL`: `localhost:5432`
- `Redis`: `localhost:6379`

Готовые команды-обёртки:

- Windows:
  - [start-docker.ps1](/C:/Repository/Apartment%20project/start-docker.ps1)
  - [start-docker.bat](/C:/Repository/Apartment%20project/start-docker.bat)
  - [stop-docker.ps1](/C:/Repository/Apartment%20project/stop-docker.ps1)
  - [logs-docker.ps1](/C:/Repository/Apartment%20project/logs-docker.ps1)
  - [rebuild-docker.ps1](/C:/Repository/Apartment%20project/rebuild-docker.ps1)
  - [rebuild-docker.bat](/C:/Repository/Apartment%20project/rebuild-docker.bat)
- Linux:
  - [start-docker.sh](/C:/Repository/Apartment%20project/start-docker.sh)
  - [stop-docker.sh](/C:/Repository/Apartment%20project/stop-docker.sh)
  - [logs-docker.sh](/C:/Repository/Apartment%20project/logs-docker.sh)
  - [rebuild-docker.sh](/C:/Repository/Apartment%20project/rebuild-docker.sh)

## Отдельный запуск приложений

### web-panel

```bash
cd "C:\Repository\Apartment project\web-panel"
npm install
npm run dev
```

Для локального запуска нужны переменные окружения панели (`DATABASE_URL`, `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`).

### ApartmentBot

```bash
cd "C:\Repository\Apartment project\ApartmentBot"
dotnet run --project src/ApartmentBot.Bot
```

Для локального запуска бота используй:

- базовый конфиг: [appsettings.json](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/appsettings.json)
- локальные секреты: [appsettings.Local.json](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/appsettings.Local.json)
- шаблон: [appsettings.Local.example.json](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/appsettings.Local.example.json)

## Текущая архитектура бота

После обновления бот больше не держит всю логику в одном `TelegramBotHandler`.

Ключевые сервисы:

- [LeadRequestService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/LeadRequestService.cs) — заявки и консультации
- [FilterWorkflowService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/FilterWorkflowService.cs) — фильтры и ввод значений
- [ApartmentNavigationService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/ApartmentNavigationService.cs) — навигация по спискам и выбор квартиры
- [ApartmentPresentationService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/ApartmentPresentationService.cs) — показ списков и карточек
- [ApartmentMessageFormatter.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/ApartmentMessageFormatter.cs) — форматирование текстов
- [TelegramMediaService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/TelegramMediaService.cs) — работа с фото и URL
- [TelegramMessageService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/TelegramMessageService.cs) — отправка текстовых сообщений

Redis в текущей версии обязателен. In-memory fallback удалён.

## Что уже улучшено

- Бот переведён на более модульную архитектуру
- Убрано двойное кеширование между сервисами и репозиториями
- Redis-ключи централизованы
- TTL состояния пользователя вынесен в конфиг и сокращён до 30 минут
- API `web-panel` облегчён под сценарии бота через `view=bot`
- Добавлено покрытие unit-тестами на ключевые сервисы и routing бота

Подробный журнал работ: [UpdateFile.md](/C:/Repository/Apartment%20project/UpdateFile.md)

## Тесты

### Бот

```bash
cd "C:\Repository\Apartment project\ApartmentBot"
dotnet test
```

### Панель

```bash
cd "C:\Repository\Apartment project\web-panel"
npm run lint
npm run typecheck
npm test
npm run build
```

Полный список проверок для PR описан в [docs/quality-checklist.md](/C:/Repository/Apartment%20project/docs/quality-checklist.md).

## Безопасность

- Не коммить реальные токены и пароли в `example`-файлы
- Для внешнего доступа к панели используй reverse proxy и HTTPS
- Для тестового доступа минимум смени:
  - `ADMIN_LOGIN`
  - `ADMIN_PASSWORD`
  - `SESSION_SECRET`
  - `TELEGRAM_BOT_TOKEN`

## Актуальные точки входа

- Общий стек: [docker-compose.yml](/C:/Repository/Apartment%20project/docker-compose.yml)
- Бот: [ApartmentBot/README.md](/C:/Repository/Apartment%20project/ApartmentBot/README.md)
- Журнал этапов: [UpdateFile.md](/C:/Repository/Apartment%20project/UpdateFile.md)
