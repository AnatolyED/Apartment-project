# ApartmentBot

Telegram-бот для поиска недвижимости, работающий поверх API `web-panel`.

## Структура

```text
ApartmentBot/
├── src/
│   ├── ApartmentBot.Domain/          # Сущности, интерфейсы, ошибки
│   ├── ApartmentBot.Application/     # DTO и прикладные сервисы
│   ├── ApartmentBot.Infrastructure/  # API client, Redis, репозитории
│   └── ApartmentBot.Bot/             # Telegram bot, handler, keyboards, services
├── tests/
│   └── ApartmentBot.Tests/           # Unit-тесты
├── Dockerfile
└── README.md
```

## Запуск

### Локально

```bash
cd "C:\Repository\Apartment project\ApartmentBot"
dotnet run --project src/ApartmentBot.Bot
```

Используемые конфиги:

- базовый: [appsettings.json](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/appsettings.json)
- локальный: [appsettings.Local.json](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/appsettings.Local.json)
- шаблон: [appsettings.Local.example.json](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/appsettings.Local.example.json)

Минимум для запуска:

- `Telegram:BotToken`
- `WebPanel:BaseUrl`
- `Redis:ConnectionString`

### Через Docker

Бот запускается как часть общего стека из корня репозитория:

```bash
cd "C:\Repository\Apartment project"
docker compose up --build apartment-bot
```

Полный запуск всего проекта:

```bash
cd "C:\Repository\Apartment project"
docker compose up --build
```

## Конфигурация

Пример реальной схемы конфигурации:

```json
{
  "WebPanel": {
    "BaseUrl": "http://localhost:3000/api"
  },
  "Telegram": {
    "BotToken": "",
    "ManagerChatId": ""
  },
  "Redis": {
    "ConnectionString": "localhost:6379",
    "UserStateTtlMinutes": 30
  }
}
```

## Архитектура

Текущая версия бота уже разложена на сервисы по ролям, а `TelegramBotHandler` работает как координатор.

Основные сервисы:

- [LeadRequestService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/LeadRequestService.cs)
- [FilterWorkflowService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/FilterWorkflowService.cs)
- [ApartmentNavigationService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/ApartmentNavigationService.cs)
- [ApartmentPresentationService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/ApartmentPresentationService.cs)
- [ApartmentMessageFormatter.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/ApartmentMessageFormatter.cs)
- [TelegramMediaService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/TelegramMediaService.cs)
- [TelegramMessageService.cs](/C:/Repository/Apartment%20project/ApartmentBot/src/ApartmentBot.Bot/Services/TelegramMessageService.cs)

## Redis

Redis обязателен.

Что хранится в Redis:

- пользовательское состояние
- кеш городов, районов и квартир

Что важно:

- in-memory fallback удалён
- TTL пользовательского состояния задаётся через `Redis:UserStateTtlMinutes`
- по умолчанию используется 30 минут

## Контракт с web-panel

Бот работает через облегчённые API-ответы `view=bot`.

Основные маршруты:

- `GET /api/cities?view=bot`
- `GET /api/districts?cityId={id}&view=bot`
- `GET /api/apartments?districtId={id}&view=bot`
- `GET /api/apartments/{id}?view=bot`

## Тесты

```bash
cd "C:\Repository\Apartment project\ApartmentBot"
dotnet test
```

Сейчас тестами прикрыты:

- `WebPanelApiClient`
- Redis-ключи и Redis user state
- `ApartmentNavigationService`
- `FilterWorkflowService`
- `LeadRequestService`
- `ApartmentPresentationService`
- `TelegramMediaService`
- `TelegramBotHandler`

## Что смотреть дальше

- общий журнал обновления: [UpdateFile.md](/C:/Repository/Apartment%20project/UpdateFile.md)
- корневой запуск проекта: [README.md](/C:/Repository/Apartment%20project/README.md)
