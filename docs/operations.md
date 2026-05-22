# Operations Runbook

Документ описывает локальный запуск монорепозитория `Apartment project`, переменные окружения, миграции и текущие правила CI. Примеры команд учитывают Windows path с пробелом: `C:\Repository\Apartment project`.

## Структура

- `web-panel` - Next.js админ-панель.
- `ApartmentBot` - .NET 10 Telegram bot, который читает данные через API панели.
- `docker-compose.yml` - ручной запуск полного стека.
- `.github/workflows/ci.yml` - проверки без Docker build.

## Локальный запуск web-panel

```powershell
cd "C:\Repository\Apartment project\web-panel"
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

Минимальные переменные для панели:

- `DATABASE_URL` - PostgreSQL connection string для Drizzle и runtime.
- `ADMIN_LOGIN` / `ADMIN_PASSWORD` - первый административный доступ.
- `SESSION_SECRET` - секрет подписи cookies, сгенерируйте случайную строку.
- `NEXT_PUBLIC_APP_URL` - публичный URL панели, локально обычно `http://localhost:3000`.
- `BOT_API_TOKEN` - shared token для bot-facing API.
- `ALLOW_UNAUTHENTICATED_BOT_API` - только для локальной отладки, в норме `false`.
- `DIAGNOSTICS_TOKEN` - token для чтения диагностики бота из панели.
- `BOT_DIAGNOSTICS_URL` - URL диагностики бота, локально `http://localhost:8080`.

## Локальный запуск ApartmentBot

```powershell
cd "C:\Repository\Apartment project\ApartmentBot"
Copy-Item src\ApartmentBot.Bot\appsettings.Local.example.json src\ApartmentBot.Bot\appsettings.Local.json
dotnet restore ApartmentBot.slnx
dotnet run --project src\ApartmentBot.Bot
```

Минимальные настройки бота:

- `Telegram:BotToken` или env `Telegram__BotToken` - токен Telegram от BotFather.
- `Telegram:ManagerChatId` или env `Telegram__ManagerChatId` - optional manager chat id для заявок.
- `WebPanel:BaseUrl` или env `WebPanel__BaseUrl` - API base URL панели, например `http://localhost:3000/api`.
- `WebPanel:ApiToken` или env `WebPanel__ApiToken` - значение, совпадающее с `BOT_API_TOKEN` в панели.
- `Redis:ConnectionString` или env `Redis__ConnectionString` - Redis обязателен.
- `Diagnostics:Urls` или env `Diagnostics__Urls` - HTTP endpoint диагностики, по умолчанию `http://0.0.0.0:8080`.
- `Diagnostics:Token` или env `Diagnostics__Token` - token для `/health/ready`, `/diagnostics/runtime` и `/diagnostics/summary`.

Для локальных секретов используйте `appsettings.Local.json`; реальные токены не должны попадать в git.

## Миграции

Миграции панели лежат в `web-panel/drizzle`.

```powershell
cd "C:\Repository\Apartment project\web-panel"
$env:DATABASE_URL = "postgresql://postgres:password@localhost:5432/realty_db"
npm run db:migrate
```

Перед PR проверьте, что новые SQL-файлы миграций и `web-panel/drizzle/meta/_journal.json` согласованы. CI сейчас не применяет миграции к отдельной базе, а проверяет lint/typecheck/tests/build/audit.

## PDF Import Workflow

Импорт квартир из PDF находится в панели: `/dashboard/apartments/import`.

Рабочий сценарий:

1. Запустите `web-panel` с доступной PostgreSQL базой и примененными миграциями.
2. Откройте `http://localhost:3000/dashboard/apartments/import`.
3. Загрузите PDF-файл.
4. Запустите анализ, проверьте распознанные строки, город, район, ЖК, цену, площадь и отделку.
5. Исправьте строки с ошибками или исключите их из импорта.
6. Подтвердите импорт.
7. Проверьте результат на странице квартир и убедитесь, что дубликаты не созданы повторно.

Ограничение server action для PDF увеличено до 20 MB в Next config. Если файл больше, его нужно предварительно уменьшить или разделить.

### Пакетная analyze-only проверка PDF клиента

Для проверки реального набора 5-10 PDF без импорта в базу используйте безопасный runner:

```powershell
cd "C:\Repository\Apartment project\web-panel"
npx tsx scripts/analyze-pdf-batch.ts --dir "C:\path\to\client-pdfs" --limit 10 --out ".\reports\pdf-import-analysis.json"
```

Что делает runner:

- рекурсивно ищет `*.pdf` в указанной папке;
- анализирует максимум 10 файлов за запуск;
- вызывает только `parseApartmentPdf`;
- не создает preview cache в `.apartment-import-cache`;
- не вызывает confirm actions;
- не пишет в PostgreSQL;
- печатает краткий отчет и, если задан `--out`, сохраняет JSON report.

Exit code будет `1`, если PDF не распарсился или в распознанных строках есть ошибки. Для исследовательского прогона, где ошибки строк нужно только собрать в отчет, добавьте `--allow-row-errors`.

Минимальный сценарий для клиентского набора:

1. Положите 5-10 PDF в отдельную локальную папку вне репозитория.
2. Запустите runner с `--dir` и `--out`.
3. Проверьте в отчете `rows`, `ready`, `warnings`, `errors`, `withLayoutImages` и `issueSummary`.
4. Если `errors > 0`, сохраните JSON report в PR notes или задаче, но не запускайте confirm/import.
5. Подтверждение импорта в базу выполняйте только вручную через UI после review строк и с понятным cleanup plan.

## Docker

Docker compose остается ручным способом поднять полный стек:

```powershell
cd "C:\Repository\Apartment project"
Copy-Item .env.docker.example .env
docker compose up --build
```

Docker build сейчас не является обязательным CI шагом и не запускается workflow. Перед релизом или изменением Dockerfile/compose запускайте Docker build вручную и фиксируйте результат в PR.

## CI

GitHub Actions workflow `.github/workflows/ci.yml` запускается на `pull_request` и push в `main`/`master`.

`web-panel` проверяет:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit --audit-level=high`

`ApartmentBot` проверяет:

- `dotnet restore ApartmentBot.slnx`
- `dotnet test ApartmentBot.slnx --configuration Release --no-restore`

Workflow намеренно не содержит `docker build`, `docker compose build` или обязательного запуска compose.
