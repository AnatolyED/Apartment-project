# Quality Checklist

Короткий checklist для локальной проверки и PR.

## Перед PR

- Проверить, что изменения не содержат реальных токенов, паролей, production connection strings или персональных данных.
- Для `web-panel` выполнить:

```powershell
cd "C:\Repository\Apartment project\web-panel"
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

- Для `ApartmentBot` выполнить:

```powershell
cd "C:\Repository\Apartment project\ApartmentBot"
dotnet restore ApartmentBot.slnx
dotnet test ApartmentBot.slnx --configuration Release --no-restore
```

- Если менялись миграции, проверить `web-panel/drizzle/*.sql` и `web-panel/drizzle/meta/_journal.json`.
- Если менялся PDF import, прогнать 5-10 реальных PDF клиента через analyze-only runner:

```powershell
cd "C:\Repository\Apartment project\web-panel"
npx tsx scripts/analyze-pdf-batch.ts --dir "C:\path\to\client-pdfs" --limit 10 --out ".\reports\pdf-import-analysis.json"
```

- Если нужен confirm-flow, сначала review analyze-only отчета, затем вручную подтвердить малый набор через UI и отдельно проверить cleanup: созданные квартиры, города/районы, layout images, audit log, import history и `.apartment-import-cache`.
- Если менялись bot-facing API routes, проверить, что `BOT_API_TOKEN`/`WebPanel__ApiToken` совпадают и unauthenticated mode не включен.
- Если менялись diagnostic endpoints, проверить `DIAGNOSTICS_TOKEN` и заголовок `X-Diagnostics-Token`.
- Если менялись Dockerfile или compose, Docker build выполнить вручную отдельно; CI его сейчас не запускает.

## Post-integration QA gates

Use this block after backend, frontend, and devops work is merged into one worktree.

- PDF import UX: upload a representative PDF, run analysis, verify row filters, status badges, editable city/district/name/rooms/area/floor/price/finishing fields, duplicate rows disabled by default, new-city/new-district warnings, and the `resolveDistrictStatus` behavior when the city will be created.
- PDF import history UI: verify the history list and batch detail page show actor, source file, mode, created/skipped/duplicate/error counts, row statuses, timestamps, empty state, and a readable failure state without hiding completed rows.
- PDF import rollback batch: use only a disposable import batch, record created apartment ids/photos before rollback, execute rollback, then verify apartments/files/history status are removed or marked consistently while unrelated apartments and other batches remain untouched.
- Full manual acceptance: analyze a PDF where every parsed row starts enabled or is manually enabled, select all visible rows, confirm that the confirmation dialog counts every enabled row, preserves corrected city/district/name values, and blocks submit only for rows with validation errors.
- Batch PDF analyze: analyze multiple PDFs or multiple batches in one session; verify per-file progress/errors, no cross-file row mixing, stable row ids, duplicate detection per existing data, and independent retry behavior for a failed file.
- Background/progress behavior: during analyze/import, verify buttons are disabled against double submit, spinner/progress text is visible, navigation/refresh/close behavior is defined, and final success/error state reconciles with import history.
- E2E confirm-flow: confirm a small import with at least one created row, one disabled row, one duplicate row, and one corrected location; verify apartments, created city/district records, layout photo attachment, audit log, import history batch, import history rows, and preview cache cleanup.
- Race/idempotency: repeat confirm from another tab/session or repeat the same PDF quickly; verify duplicate rows are reported as duplicates and do not abort the whole import.
- Docker build result: if Dockerfile or compose changed, run manual Docker build outside CI and record the result in PR notes. CI intentionally does not run Docker build.
- Health page bot-unavailable behavior: stop or block the bot diagnostics endpoint, open `/dashboard/system` as admin, and verify the web-panel health card still renders while Telegram bot status shows a clear problem state and diagnostic JSON.

## PR Notes

В описании PR укажите:

- какие команды были запущены локально;
- нужны ли новые env vars или миграции;
- затрагивает ли изменение PDF import, bot API или диагностику;
- запускался ли ручной Docker build, если менялись Dockerfile/compose.
