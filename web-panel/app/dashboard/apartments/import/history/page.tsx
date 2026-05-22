import Link from 'next/link';
import { ArrowLeft, FileClock, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getApartmentImportHistoryAction,
  listApartmentImportHistoryAction,
  type ApartmentImportHistoryListItem,
  type ApartmentImportHistoryStatus,
} from '@/lib/apartments/import-history';
import type { ApartmentImportBatch, ApartmentImportRow } from '@/lib/db/schema';
import { RollbackBatchButton } from './rollback-batch-button';

interface ImportHistoryPageProps {
  searchParams: Promise<{ batch?: string | string[]; rollback?: string | string[] }>;
}

type ImportHistoryDetails = {
  import: ApartmentImportBatch;
  rows: ApartmentImportRow[];
};

type ImportHistoryRow = ApartmentImportRow;

const batchStatusMeta: Record<ApartmentImportHistoryStatus, { label: string; className: string }> = {
  completed: {
    label: 'Завершен',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  partial: {
    label: 'Частично',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  failed: {
    label: 'Ошибка',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
};

const rowStatusMeta: Record<string, { label: string; className: string }> = {
  created: {
    label: 'Создана',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  duplicate: {
    label: 'Дубликат',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  failed: {
    label: 'Ошибка',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
};

const fallbackStatusMeta = {
  label: 'Неизвестно',
  className: 'border-slate-200 bg-slate-50 text-slate-700',
};

const rollbackStatusMeta: Record<string, { label: string; className: string }> = {
  not_started: {
    label: 'Не отменялся',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  completed: {
    label: 'Отменен',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  partial: {
    label: 'Отменен частично',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  failed: {
    label: 'Ошибка отмены',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  rolled_back: {
    label: 'Отмена выполнена',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  already_missing: {
    label: 'Уже отсутствует',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  skipped: {
    label: 'Пропущено',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
};

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatMode(value: string) {
  return value === 'rules' ? 'Правила без ИИ' : value;
}

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function RollbackNotice({ status }: { status?: string }) {
  if (!status) {
    return null;
  }

  const messages: Record<string, { title: string; description: string; className: string }> = {
    completed: {
      title: 'Импорт отменен',
      description:
        'Квартиры, созданные этим импортом, удалены. Автоматически созданные города и районы очищены, если после отмены они остались пустыми.',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    already: {
      title: 'Импорт уже был отменен',
      description: 'Повторная отмена не требуется.',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    failed: {
      title: 'Не удалось отменить импорт',
      description: 'Проверьте строки импорта и повторите попытку.',
      className: 'border-red-200 bg-red-50 text-red-800',
    },
    missing_batch: {
      title: 'Не удалось отменить импорт',
      description: 'Batch не найден в запросе.',
      className: 'border-red-200 bg-red-50 text-red-800',
    },
  };
  const message = messages[status];

  if (!message) {
    return null;
  }

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${message.className}`}>
      <div className="font-medium">{message.title}</div>
      <div className="mt-1">{message.description}</div>
    </div>
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function StatusBadge({
  status,
  type,
}: {
  status: string;
  type: 'batch' | 'row' | 'rollback';
}) {
  const meta =
    type === 'batch'
      ? batchStatusMeta[status as ApartmentImportHistoryStatus] ?? fallbackStatusMeta
      : type === 'rollback'
        ? rollbackStatusMeta[status] ?? fallbackStatusMeta
        : rowStatusMeta[status] ?? fallbackStatusMeta;

  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xl font-semibold text-slate-900">{value.toLocaleString('ru-RU')}</div>
      <div className="mt-1 text-xs font-medium uppercase text-slate-500">{label}</div>
    </div>
  );
}

function LimitedList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <div className="text-sm text-gray-500">{emptyLabel}</div>;
  }

  const visibleItems = items.slice(0, 6);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="space-y-1">
      {visibleItems.map((item) => (
        <div key={item} className="text-sm text-gray-700">
          {item}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="text-sm text-gray-500">Еще {hiddenCount.toLocaleString('ru-RU')}</div>
      )}
    </div>
  );
}

function BatchList({
  imports,
  selectedBatchId,
}: {
  imports: ApartmentImportHistoryListItem[];
  selectedBatchId?: string;
}) {
  if (imports.length === 0) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-8 text-center text-sm text-gray-500">
          Истории PDF-импортов пока нет.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {imports.map((item) => {
        const isSelected = item.id === selectedBatchId;

        return (
          <Link
            key={item.id}
            href={`/dashboard/apartments/import/history?batch=${item.id}`}
            className={`block rounded-lg border bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/40 ${
              isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <div className="truncate font-medium text-slate-900">{item.fileName}</div>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatDate(item.createdAt)} · {item.actorLogin} · {formatMode(item.mode)}
                </div>
              </div>
              <StatusBadge status={item.status as ApartmentImportHistoryStatus} type="batch" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
              <div>Создано: {item.importedRows.toLocaleString('ru-RU')}</div>
              <div>Дубликаты: {item.duplicateRows.toLocaleString('ru-RU')}</div>
              <div>Ошибки: {item.errorRows.toLocaleString('ru-RU')}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function RowMessages({ row }: { row: ImportHistoryRow }) {
  const warnings = asStringArray(row.warnings);
  const errors = asStringArray(row.errors);
  const messages = [row.message, ...warnings, ...errors].filter(Boolean);

  if (messages.length === 0) {
    return <span className="text-gray-500">Нет</span>;
  }

  return (
    <div className="space-y-1">
      {messages.map((message, index) => (
        <div key={`${row.id}-${message}-${index}`}>{message}</div>
      ))}
    </div>
  );
}

function DetailRows({ rows }: { rows: ImportHistoryRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-gray-500">Строк нет.</div>;
  }

  return (
    <>
      <div className="space-y-3 xl:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{row.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {row.sourcePage ? `Стр. ${row.sourcePage}` : 'Страница не указана'}
                  {row.sourceId ? ` · ID ${row.sourceId}` : ''}
                </div>
              </div>
              <StatusBadge status={row.status} type="row" />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-gray-500">Город:</span> {row.cityName || '-'}
              </div>
              <div>
                <span className="text-gray-500">Район:</span> {row.districtName || '-'}
              </div>
              <div>
                <span className="text-gray-500">Apartment ID:</span> {row.apartmentId || '-'}
              </div>
              <div>
                <span className="text-gray-500">Отмена:</span>{' '}
                <StatusBadge status={row.rollbackStatus} type="rollback" />
              </div>
              <div>
                <span className="text-gray-500">Сообщения:</span> <RowMessages row={row} />
              </div>
              {row.rollbackMessage && (
                <div>
                  <span className="text-gray-500">Отмена:</span> {row.rollbackMessage}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 xl:block">
        <Table className="min-w-[1200px]">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-28">Статус</TableHead>
              <TableHead className="w-28">Источник</TableHead>
              <TableHead className="w-[260px]">Квартира</TableHead>
              <TableHead className="w-[180px]">Город</TableHead>
              <TableHead className="w-[220px]">Район</TableHead>
              <TableHead className="w-[260px]">Apartment ID</TableHead>
              <TableHead className="w-40">Отмена</TableHead>
              <TableHead>Сообщения</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="align-top">
                  <StatusBadge status={row.status} type="row" />
                </TableCell>
                <TableCell className="align-top text-sm">
                  {row.sourcePage ? `Стр. ${row.sourcePage}` : '-'}
                  {row.sourceId && <div className="mt-1 text-xs text-gray-500">ID {row.sourceId}</div>}
                </TableCell>
                <TableCell className="align-top font-medium">{row.name}</TableCell>
                <TableCell className="align-top">{row.cityName || '-'}</TableCell>
                <TableCell className="align-top">{row.districtName || '-'}</TableCell>
                <TableCell className="align-top text-xs text-gray-600">{row.apartmentId || '-'}</TableCell>
                <TableCell className="align-top">
                  <StatusBadge status={row.rollbackStatus} type="rollback" />
                  {row.rollbackMessage && (
                    <div className="mt-1 text-xs text-gray-500">{row.rollbackMessage}</div>
                  )}
                </TableCell>
                <TableCell className="align-top text-sm">
                  <RowMessages row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function BatchDetails({
  details,
}: {
  details: ImportHistoryDetails | null;
}) {
  if (!details) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-8 text-center text-sm text-gray-500">
          Выберите batch импорта слева.
        </CardContent>
      </Card>
    );
  }

  const batch = details.import;
  const createdCities = batch.createdCities ?? [];
  const createdDistricts = batch.createdDistricts ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {batch.fileName}
              <StatusBadge status={batch.status as ApartmentImportHistoryStatus} type="batch" />
            </CardTitle>
            <CardDescription>
              {formatDate(batch.createdAt)} · {batch.actorLogin} · {formatMode(batch.mode)} ·{' '}
              {batch.parserProvider}
            </CardDescription>
            <div className="mt-2">
              <StatusBadge status={batch.rollbackStatus} type="rollback" />
              {batch.rolledBackAt && (
                <span className="ml-2 text-xs text-gray-500">
                  {formatDate(batch.rolledBackAt)}
                  {batch.rolledBackByLogin ? ` · ${batch.rolledBackByLogin}` : ''}
                </span>
              )}
            </div>
          </div>
          <RollbackBatchButton
            batchId={batch.id}
            fileName={batch.fileName}
            importedRows={batch.importedRows}
            createdCities={createdCities}
            createdDistricts={createdDistricts}
            rollbackStatus={batch.rollbackStatus}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricTile label="Всего" value={batch.totalRows} />
            <MetricTile label="Отправлено" value={batch.submittedRows} />
            <MetricTile label="Создано" value={batch.importedRows} />
            <MetricTile label="Дубликаты" value={batch.duplicateRows} />
            <MetricTile label="Ошибки" value={batch.errorRows} />
            <MetricTile label="Проверить" value={batch.warningRows} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="mb-2 text-sm font-medium text-blue-900">
                Созданные города: {createdCities.length.toLocaleString('ru-RU')}
              </div>
              <LimitedList items={createdCities} emptyLabel="Новых городов не было" />
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="mb-2 text-sm font-medium text-blue-900">
                Созданные районы: {createdDistricts.length.toLocaleString('ru-RU')}
              </div>
              <LimitedList items={createdDistricts} emptyLabel="Новых районов не было" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Результаты строк</CardTitle>
          <CardDescription>Статусы, сообщения, созданные квартиры и исходные строки PDF</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailRows rows={details.rows} />
        </CardContent>
      </Card>
    </div>
  );
}

export default async function ApartmentImportHistoryPage({ searchParams }: ImportHistoryPageProps) {
  const params = await searchParams;
  const historyResult = await listApartmentImportHistoryAction({ limit: 50 });
  const imports = historyResult.imports;
  const requestedBatchId = getStringParam(params.batch);
  const rollbackNoticeStatus = getStringParam(params.rollback);
  const selectedBatch = imports.find((item) => item.id === requestedBatchId) ?? imports[0];
  const detailsResult = selectedBatch
    ? await getApartmentImportHistoryAction({ id: selectedBatch.id })
    : null;
  const details: ImportHistoryDetails | null =
    detailsResult?.success && detailsResult.import && detailsResult.rows
      ? { import: detailsResult.import, rows: detailsResult.rows }
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="История PDF-импортов"
        subtitle="Batch-импорты, созданные справочники, результаты строк и подготовка отмены"
        icon={<FileClock className="h-6 w-6 text-white" />}
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/apartments/import">
              <ArrowLeft className="h-4 w-4" />
              К PDF-импорту
            </Link>
          </Button>
        }
      />

      <RollbackNotice status={rollbackNoticeStatus} />

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700">Batches</div>
          <BatchList imports={imports} selectedBatchId={selectedBatch?.id} />
        </div>
        <BatchDetails details={details} />
      </div>
    </div>
  );
}
