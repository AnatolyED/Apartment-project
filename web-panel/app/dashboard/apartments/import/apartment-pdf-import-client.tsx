'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  FileText,
  Loader2,
  MapPin,
  RotateCcw,
  ScanSearch,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  confirmApartmentPdfImportAction,
  getApartmentPdfImportAnalyzeJobAction,
  startApartmentPdfImportAnalyzeJobAction,
  type AnalyzeApartmentPdfImportResult,
  type ApartmentImportAnalyzeJobSnapshot,
  type ApartmentImportPreviewIssue,
  type ApartmentImportPreviewRow,
  type ApartmentImportRowStatus,
  type ConfirmApartmentPdfImportResult,
  type DirectoryResolutionStatus,
} from '@/lib/apartments/import-actions';
import { FINISHING_OPTIONS, formatFinishingLabel } from '@/lib/validators';
import {
  analyzeApartmentPdfImportFromPageAction,
  confirmApartmentPdfImportFromPageAction,
} from './apartment-pdf-import-form-actions';

interface ApartmentPdfImportClientProps {
  cities: Array<{ id: string; name: string }>;
  districts: Array<{ id: string; cityId: string; name: string }>;
  initialPreview?: AnalyzeApartmentPdfImportResult | null;
  initialError?: string | null;
}

type DraftRow = ApartmentImportPreviewRow & {
  enabled: boolean;
};

type PreviewFilter = ApartmentImportRowStatus | 'all' | 'selected' | 'new-location';
type FieldName = NonNullable<ApartmentImportPreviewIssue['field']>;

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

const statusMeta: Record<
  ApartmentImportRowStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  ready: {
    label: 'Готово',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  warning: {
    label: 'Проверить',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: AlertTriangle,
  },
  error: {
    label: 'Ошибка',
    className: 'border-red-200 bg-red-50 text-red-700',
    icon: XCircle,
  },
  duplicate: {
    label: 'Дубликат',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: XCircle,
  },
};

const resolutionMeta: Record<DirectoryResolutionStatus, { label: string; className: string }> = {
  existing: {
    label: 'есть в базе',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  create: {
    label: 'будет создано',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  missing: {
    label: 'заполните',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
};

const previewFilterLabels: Record<PreviewFilter, string> = {
  all: 'Все',
  ready: statusMeta.ready.label,
  warning: statusMeta.warning.label,
  error: statusMeta.error.label,
  duplicate: statusMeta.duplicate.label,
  selected: 'Выбранные',
  'new-location': 'Новые города/районы',
};

const editableIssueFields = new Set<string>([
  'cityName',
  'districtName',
  'name',
  'finishing',
  'rooms',
  'area',
  'floor',
  'price',
]);

function formatBytes(value: number) {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024)).toLocaleString('ru-RU')} КБ`;
  }

  return `${(value / 1024 / 1024).toLocaleString('ru-RU', {
    maximumFractionDigits: 1,
  })} МБ`;
}

function formatPrice(value: number | null) {
  return value === null ? '-' : `${currencyFormatter.format(value)} ₽`;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDistrictName(value: string) {
  return normalizeName(value)
    .replace(/\b(р н|рн|район)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNullableNumber(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function SummaryTile({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${className}`}>
      <div className="text-2xl font-semibold">{value.toLocaleString('ru-RU')}</div>
      <div className="mt-1 text-xs font-medium uppercase">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApartmentImportRowStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;

  return (
    <Badge variant="outline" className={meta.className}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function ResolutionBadge({ status }: { status: DirectoryResolutionStatus }) {
  const meta = resolutionMeta[status];

  return (
    <Badge variant="outline" className={`w-fit ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

function getIssuesByField(issues: ApartmentImportPreviewIssue[], field: FieldName) {
  return issues.filter((issue) => issue.field === field);
}

function getGeneralIssues(issues: ApartmentImportPreviewIssue[]) {
  return issues.filter((issue) => !issue.field || !editableIssueFields.has(issue.field));
}

function IssueMessages({ issues }: { issues: ApartmentImportPreviewIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {issues.map((issue, index) => (
        <div
          key={`${issue.field || 'row'}-${issue.message}-${index}`}
          className={
            issue.severity === 'error'
              ? 'text-xs leading-snug text-red-700'
              : 'text-xs leading-snug text-amber-700'
          }
        >
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function FieldStack({
  children,
  footer,
  issues,
  className = '',
}: {
  children: ReactNode;
  footer?: ReactNode;
  issues?: ApartmentImportPreviewIssue[];
  className?: string;
}) {
  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      {children}
      {footer && <div className="flex flex-wrap items-center gap-1.5">{footer}</div>}
      <IssueMessages issues={issues || []} />
    </div>
  );
}

function LimitedNameList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <div className="text-sm text-gray-500">{emptyLabel}</div>;
  }

  const visibleItems = items.slice(0, 5);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="space-y-1">
      {visibleItems.map((item) => (
        <div key={item} className="text-sm text-gray-700">
          {item}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="text-sm text-gray-500">
          Еще {hiddenCount.toLocaleString('ru-RU')}
        </div>
      )}
    </div>
  );
}

function ReportRowsSection({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Array<{
    key: string;
    name: string;
    source?: string;
    messages: string[];
  }>;
  tone: 'red' | 'amber' | 'slate' | 'emerald';
}) {
  if (rows.length === 0) {
    return null;
  }

  const toneClassName = {
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[tone];

  return (
    <div className="space-y-2">
      <div className="font-medium text-gray-900">
        {title}: {rows.length.toLocaleString('ru-RU')}
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className={`rounded-lg border px-3 py-2 ${toneClassName}`}>
            <div className="text-sm font-medium">{row.name}</div>
            {row.source && <div className="mt-1 text-xs opacity-80">{row.source}</div>}
            <div className="mt-1 space-y-1 text-sm">
              {row.messages.map((message, index) => (
                <div key={`${row.key}-${message}-${index}`}>{message}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApartmentPdfImportClient({
  cities,
  districts,
  initialPreview,
  initialError,
}: ApartmentPdfImportClientProps) {
  const initialCityName =
    initialPreview?.context?.cityName ?? (cities.length === 1 ? cities[0].name : '');
  const initialDistrictName =
    initialPreview?.context?.districtName ?? (districts.length === 1 ? districts[0].name : '');
  const [defaultCityName, setDefaultCityName] = useState(initialCityName);
  const [defaultDistrictName, setDefaultDistrictName] = useState(initialDistrictName);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(
    initialPreview?.success ? (initialPreview.importId ?? null) : null
  );
  const [draftRows, setDraftRows] = useState<DraftRow[]>(
    initialPreview?.success && initialPreview.rows
      ? initialPreview.rows.map((row) => ({ ...row, enabled: row.status !== 'duplicate' }))
      : []
  );
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [bulkCityName, setBulkCityName] = useState('');
  const [bulkDistrictName, setBulkDistrictName] = useState('');
  const [formError, setFormError] = useState<string | null>(initialError ?? null);
  const [importResult, setImportResult] = useState<ConfirmApartmentPdfImportResult | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [analyzeJob, setAnalyzeJob] = useState<ApartmentImportAnalyzeJobSnapshot | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input =
      pdfFileInputRef.current ??
      (typeof document === 'undefined'
        ? null
        : (document.getElementById('pdfFile') as HTMLInputElement | null));
    if (!input) {
      return undefined;
    }

    const syncFile = (resetCurrentPreview: boolean) => {
      setPdfFile(input.files?.[0] ?? null);
      if (!resetCurrentPreview) {
        return;
      }

      setImportId(null);
      setDraftRows([]);
      setImportResult(null);
      setPreviewFilter('all');
      setBulkCityName('');
      setBulkDistrictName('');
      setIsConfirmDialogOpen(false);
      setAnalyzeJob(null);
    };
    const handleNativeFileInput = () => syncFile(true);

    syncFile(false);
    input.addEventListener('change', handleNativeFileInput);
    input.addEventListener('input', handleNativeFileInput);

    return () => {
      input.removeEventListener('change', handleNativeFileInput);
      input.removeEventListener('input', handleNativeFileInput);
    };
  }, []);

  const matchedDefaultCity = useMemo(
    () => cities.find((city) => normalizeName(city.name) === normalizeName(defaultCityName)),
    [cities, defaultCityName]
  );
  const districtSuggestions = useMemo(() => {
    const source = matchedDefaultCity
      ? districts.filter((district) => district.cityId === matchedDefaultCity.id)
      : districts;
    return Array.from(new Set(source.map((district) => district.name))).sort((a, b) =>
      a.localeCompare(b, 'ru')
    );
  }, [districts, matchedDefaultCity]);
  const matchedBulkCity = useMemo(
    () => cities.find((city) => normalizeName(city.name) === normalizeName(bulkCityName)),
    [cities, bulkCityName]
  );
  const bulkDistrictSuggestions = useMemo(() => {
    const source = matchedBulkCity
      ? districts.filter((district) => district.cityId === matchedBulkCity.id)
      : districts;

    return Array.from(new Set(source.map((district) => district.name))).sort((a, b) =>
      a.localeCompare(b, 'ru')
    );
  }, [districts, matchedBulkCity]);

  function resolveCityStatus(cityName: string): DirectoryResolutionStatus {
    const normalized = normalizeName(cityName);
    if (!normalized) {
      return 'missing';
    }

    return cities.some((city) => normalizeName(city.name) === normalized) ? 'existing' : 'create';
  }

  function resolveDistrictStatus(
    cityName: string,
    districtName: string
  ): DirectoryResolutionStatus {
    const normalizedDistrict = normalizeDistrictName(districtName);
    if (!normalizedDistrict) {
      return 'missing';
    }

    const normalizedCity = normalizeName(cityName);
    const city = cities.find((item) => normalizeName(item.name) === normalizedCity);
    if (normalizedCity && !city) {
      return 'create';
    }

    const source = city ? districts.filter((district) => district.cityId === city.id) : districts;
    return source.some(
      (district) => normalizeDistrictName(district.name) === normalizedDistrict
    )
      ? 'existing'
      : 'create';
  }

  function getRowIssues(row: DraftRow): ApartmentImportPreviewIssue[] {
    const dynamicIssues: ApartmentImportPreviewIssue[] = [];

    if (!row.cityName.trim()) {
      dynamicIssues.push({
        field: 'cityName',
        severity: 'error',
        message: 'Укажите город',
      });
    } else if (resolveCityStatus(row.cityName) === 'create') {
      dynamicIssues.push({
        field: 'cityName',
        severity: 'warning',
        message: `Город «${row.cityName.trim()}» будет создан после подтверждения`,
      });
    }
    if (!row.districtName.trim()) {
      dynamicIssues.push({
        field: 'districtName',
        severity: 'error',
        message: 'Укажите район',
      });
    } else if (resolveDistrictStatus(row.cityName, row.districtName) === 'create') {
      dynamicIssues.push({
        field: 'districtName',
        severity: 'warning',
        message: `Район «${row.districtName.trim()}» будет создан после подтверждения`,
      });
    }
    if (!row.name.trim()) {
      dynamicIssues.push({
        field: 'name',
        severity: 'error',
        message: 'Укажите название квартиры',
      });
    }
    if (!row.finishing) {
      dynamicIssues.push({
        field: 'finishing',
        severity: 'error',
        message: 'Выберите отделку',
      });
    }
    if (!row.rooms.trim()) {
      dynamicIssues.push({
        field: 'rooms',
        severity: 'error',
        message: 'Укажите комнаты',
      });
    }
    if (row.area === null || row.area <= 0) {
      dynamicIssues.push({
        field: 'area',
        severity: 'error',
        message: 'Укажите площадь',
      });
    }
    if (row.floor === null || !Number.isInteger(row.floor)) {
      dynamicIssues.push({
        field: 'floor',
        severity: 'error',
        message: 'Укажите этаж',
      });
    }
    if (row.price === null || row.price <= 0) {
      dynamicIssues.push({
        field: 'price',
        severity: 'error',
        message: 'Укажите цену',
      });
    }

    const stableIssues = row.issues.filter(
      (issue) =>
        !(
          issue.severity === 'error' &&
          issue.field &&
          editableIssueFields.has(issue.field)
        )
    );

    return [...dynamicIssues, ...stableIssues];
  }

  function getRowStatus(row: DraftRow): ApartmentImportRowStatus {
    const issues = getRowIssues(row);

    if (issues.some((issue) => issue.severity === 'error')) {
      return 'error';
    }
    if (row.status === 'duplicate') {
      return 'duplicate';
    }
    if (issues.some((issue) => issue.severity === 'warning') || row.status === 'warning') {
      return 'warning';
    }

    return 'ready';
  }

  const rowsWithState = draftRows.map((row) => ({
    ...row,
    status: getRowStatus(row),
    issues: getRowIssues(row),
    cityResolution: resolveCityStatus(row.cityName),
    districtResolution: resolveDistrictStatus(row.cityName, row.districtName),
  }));
  const enabledRows = rowsWithState.filter((row) => row.enabled);
  const selectedRows = enabledRows;
  const enabledRowIdSet = new Set(enabledRows.map((row) => row.id));
  const visibleRows = rowsWithState.filter((row) => {
    if (previewFilter === 'all') {
      return true;
    }
    if (previewFilter === 'selected') {
      return row.enabled;
    }
    if (previewFilter === 'new-location') {
      return row.cityResolution === 'create' || row.districtResolution === 'create';
    }

    return row.status === previewFilter;
  });
  const blockingRows = enabledRows.filter((row) => row.status === 'error');
  const reviewRows = enabledRows.filter((row) => row.status === 'warning');
  const enabledDuplicateRows = enabledRows.filter((row) => row.status === 'duplicate');
  const expectedCreatedRows = Math.max(0, enabledRows.length - enabledDuplicateRows.length);
  const canAnalyze = !isAnalyzing;
  const canImport = !!importId && enabledRows.length > 0 && blockingRows.length === 0 && !isImporting;
  const duplicateRows = rowsWithState.filter((row) => row.status === 'duplicate').length;
  const selectedErrorRows = selectedRows.filter((row) => row.status === 'error');
  const visibleRowIds = visibleRows.map((row) => row.id);
  const selectedVisibleRows = visibleRows.filter((row) => row.enabled);
  const allVisibleRowsSelected = visibleRows.length > 0 && selectedVisibleRows.length === visibleRows.length;
  const createdCityNames = new Set(
    enabledRows
      .filter((row) => row.cityResolution === 'create')
      .map((row) => row.cityName.trim())
      .filter(Boolean)
  );
  const createdDistrictNames = new Set(
    enabledRows
      .filter((row) => row.districtResolution === 'create')
      .map((row) => `${row.cityName.trim()} / ${row.districtName.trim()}`)
      .filter((value) => !value.endsWith(' / '))
  );
  const createdCityNameList = Array.from(createdCityNames).sort((a, b) => a.localeCompare(b, 'ru'));
  const createdDistrictNameList = Array.from(createdDistrictNames).sort((a, b) =>
    a.localeCompare(b, 'ru')
  );
  const rowsById = new Map(rowsWithState.map((row) => [row.id, row]));
  const importReportRows = (importResult?.rows || []).map((row) => {
    const previewRow = rowsById.get(row.rowId);
    const warningMessages =
      previewRow?.issues
        .filter((issue) => issue.severity === 'warning')
        .map((issue) => issue.message) || [];
    const sourceParts = [
      previewRow?.sourcePage,
      previewRow?.sourceId ? `ID ${previewRow.sourceId}` : '',
    ].filter(Boolean);

    return {
      ...row,
      key: `${row.rowId}-${row.status}`,
      name: row.name || previewRow?.name || 'Строка импорта',
      source: sourceParts.length > 0 ? sourceParts.join(', ') : undefined,
      messages: [row.message, ...warningMessages].filter(Boolean) as string[],
      hasPreviewWarnings: warningMessages.length > 0,
    };
  });
  const failedReportRows = importReportRows.filter((row) => row.status === 'failed');
  const duplicateReportRows = importReportRows.filter((row) => row.status === 'duplicate');
  const warningCreatedReportRows = importReportRows.filter(
    (row) => row.status === 'created' && (row.message || row.hasPreviewWarnings)
  );
  const createdReportRows = importReportRows.filter(
    (row) => row.status === 'created' && !row.message && !row.hasPreviewWarnings
  );

  function resetPreview() {
    setImportId(null);
    setDraftRows([]);
    setImportResult(null);
    setPreviewFilter('all');
    setBulkCityName('');
    setBulkDistrictName('');
    setIsConfirmDialogOpen(false);
    setAnalyzeJob(null);
  }

  function handlePdfFileChange(event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) {
    setPdfFile(event.currentTarget.files?.[0] ?? null);
    resetPreview();
  }

  function getPdfFileInput() {
    if (pdfFileInputRef.current) {
      return pdfFileInputRef.current;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    return document.getElementById('pdfFile') as HTMLInputElement | null;
  }

  function updateRow(rowId: string, patch: Partial<DraftRow>) {
    setDraftRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  }

  function toggleRowSelection(rowId: string, checked: boolean) {
    updateRow(rowId, { enabled: checked });
  }

  function setVisibleRowsSelection(checked: boolean) {
    const visibleRowIdSet = new Set(visibleRowIds);
    setDraftRows((currentRows) =>
      currentRows.map((row) => (visibleRowIdSet.has(row.id) ? { ...row, enabled: checked } : row))
    );
  }

  function handleBulkCityChange(value: string) {
    setBulkCityName(value);

    const nextCity = cities.find((city) => normalizeName(city.name) === normalizeName(value));
    if (!bulkDistrictName.trim() || !nextCity) {
      return;
    }

    const districtStillMatches = districts.some(
      (district) =>
        district.cityId === nextCity.id &&
        normalizeDistrictName(district.name) === normalizeDistrictName(bulkDistrictName)
    );

    if (!districtStillMatches) {
      setBulkDistrictName('');
    }
  }

  function handleBulkDistrictChange(value: string) {
    setBulkDistrictName(value);
  }

  function getBulkLocationPatch({ allowDefaultFallback }: { allowDefaultFallback: boolean }) {
    const hasBulkLocation = !!bulkCityName.trim() || !!bulkDistrictName.trim();

    return {
      cityName: bulkCityName.trim() || (!hasBulkLocation && allowDefaultFallback ? defaultCityName.trim() : ''),
      districtName:
        bulkDistrictName.trim() ||
        (!hasBulkLocation && allowDefaultFallback ? defaultDistrictName.trim() : ''),
    };
  }

  function applyLocationToSelectedRows({ onlyMissing }: { onlyMissing: boolean }) {
    if (selectedRows.length === 0) {
      setFormError('Выберите хотя бы одну строку.');
      return;
    }

    const { cityName, districtName } = getBulkLocationPatch({ allowDefaultFallback: onlyMissing });

    if (!cityName && !districtName) {
      setFormError(
        onlyMissing
          ? 'Выберите город или район в блоке массовых действий либо заполните значения по умолчанию.'
          : 'Выберите город или район для применения к выбранным строкам.'
      );
      return;
    }

    setFormError(null);
    setDraftRows((currentRows) =>
      currentRows.map((row) => {
        if (!enabledRowIdSet.has(row.id)) {
          return row;
        }

        const nextCityName = cityName && (!onlyMissing || !row.cityName.trim()) ? cityName : row.cityName;
        const nextDistrictName =
          districtName && (!onlyMissing || !row.districtName.trim()) ? districtName : row.districtName;

        if (nextCityName === row.cityName && nextDistrictName === row.districtName) {
          return row;
        }

        return {
          ...row,
          cityName: nextCityName,
          districtName: nextDistrictName,
        };
      })
    );
  }

  function applyBulkLocationToSelectedRows() {
    applyLocationToSelectedRows({ onlyMissing: false });
  }

  function excludeErrorRowsFromImport() {
    setFormError(null);
    setDraftRows((currentRows) =>
      currentRows.map((row) => {
        const rowWithState = rowsWithState.find((currentRow) => currentRow.id === row.id);
        return rowWithState?.status === 'error' ? { ...row, enabled: false } : row;
      })
    );
  }

  function deleteSelectedErrorRows() {
    const selectedErrorRowIds = new Set(selectedErrorRows.map((row) => row.id));

    setFormError(null);
    setDraftRows((currentRows) => currentRows.filter((row) => !selectedErrorRowIds.has(row.id)));
  }

  function applyDefaultsToMissingRows() {
    applyLocationToSelectedRows({ onlyMissing: true });
  }

  function openImportConfirmation() {
    setFormError(null);

    if (!importId) {
      setFormError('Сначала запустите анализ PDF.');
      return;
    }
    if (blockingRows.length > 0) {
      setFormError('Исправьте строки с ошибками перед подтверждением импорта.');
      return;
    }
    if (enabledRows.length === 0) {
      setFormError('Включите хотя бы одну строку для импорта.');
      return;
    }

    setIsConfirmDialogOpen(true);
  }

  function applyAnalyzeResult(result: NonNullable<ApartmentImportAnalyzeJobSnapshot['result']>) {
    if (!result.success || !result.importId || !result.rows) {
      resetPreview();
      setFormError(result.error || 'Не удалось проанализировать PDF.');
      return false;
    }

    setImportId(result.importId);
    setDraftRows(result.rows.map((row) => ({ ...row, enabled: row.status !== 'duplicate' })));
    setPreviewFilter('all');
    setBulkCityName('');
    setBulkDistrictName('');
    return true;
  }

  async function waitForAnalyzeJob(jobId: string) {
    let currentJob = await getApartmentPdfImportAnalyzeJobAction({ jobId });
    setAnalyzeJob(currentJob);
    let pollCount = 0;

    while (currentJob.status === 'queued' || currentJob.status === 'running') {
      if (pollCount >= 180) {
        return {
          ...currentJob,
          success: false,
          status: 'failed' as const,
          progress: 100,
          stage: 'timeout',
          error: 'Анализ PDF занял слишком много времени. Попробуйте запустить анализ повторно.',
          updatedAt: new Date().toISOString(),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      pollCount += 1;
      currentJob = await getApartmentPdfImportAnalyzeJobAction({ jobId });
      setAnalyzeJob(currentJob);
    }

    return currentJob;
  }

  async function handleAnalyze() {
    setFormError(null);
    setImportResult(null);
    setAnalyzeJob(null);

    const selectedPdfFile = pdfFile ?? getPdfFileInput()?.files?.[0] ?? null;

    if (!selectedPdfFile) {
      setFormError('Загрузите PDF-файл.');
      return;
    }

    const formData = new FormData();
    formData.append('cityName', defaultCityName);
    formData.append('districtName', defaultDistrictName);
    formData.append('mode', 'rules');
    formData.append('pdfFile', selectedPdfFile);

    setIsAnalyzing(true);

    try {
      const startedJob = await startApartmentPdfImportAnalyzeJobAction(formData);
      setAnalyzeJob(startedJob);

      if (!startedJob.success || !startedJob.jobId) {
        resetPreview();
        setFormError(startedJob.error || 'Не удалось запустить анализ PDF.');
        return;
      }

      const completedJob = await waitForAnalyzeJob(startedJob.jobId);

      if (completedJob.status !== 'completed' || !completedJob.result) {
        resetPreview();
        setAnalyzeJob(completedJob);
        setFormError(completedJob.error || 'Не удалось проанализировать PDF.');
        return;
      }

      applyAnalyzeResult(completedJob.result);
    } catch (error) {
      resetPreview();
      const message = error instanceof Error ? error.message : '';
      setFormError(
        message.includes('Body exceeded')
          ? 'PDF не удалось отправить из-за ограничения размера запроса. Попробуйте обновить страницу; лимит сервера уже должен быть увеличен до 20 МБ.'
          : message || 'Не удалось проанализировать PDF.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleImport() {
    setFormError(null);
    setImportResult(null);

    if (!importId) {
      setFormError('Сначала запустите анализ PDF.');
      return;
    }
    if (blockingRows.length > 0) {
      setFormError('Исправьте строки с ошибками перед подтверждением импорта.');
      return;
    }

    setIsImporting(true);

    try {
      const rowsForImport = enabledRows.map((row) => {
        if (!row.finishing || row.area === null || row.floor === null || row.price === null) {
          throw new Error('Исправьте строки с ошибками перед подтверждением импорта.');
        }

        return {
          rowId: row.id,
          enabled: row.enabled,
          cityName: row.cityName,
          districtName: row.districtName,
          name: row.name,
          finishing: row.finishing,
          rooms: row.rooms,
          area: row.area,
          floor: row.floor,
          price: row.price,
        };
      });
      const result = await confirmApartmentPdfImportAction({
        importId,
        mode: 'rules',
        rows: rowsForImport,
      });
      setImportResult(result);
      setIsConfirmDialogOpen(false);

      if (!result.success) {
        setFormError(result.error || 'Не удалось импортировать квартиры.');
      }
    } catch (error) {
      setIsConfirmDialogOpen(false);
      setFormError(
        error instanceof Error
          ? error.message
          : 'Не удалось импортировать квартиры.'
      );
    } finally {
      setIsImporting(false);
    }
  }

  function renderConfirmFallbackInputs() {
    return (
      <div className="hidden">
        <input type="hidden" name="importId" value={importId ?? ''} />
        <input type="hidden" name="mode" value="rules" />
        {rowsWithState.map((row, index) => (
          <div key={row.id}>
            <input type="hidden" name={`rows.${index}.rowId`} value={row.id} />
            <input type="hidden" name={`rows.${index}.enabled`} value={row.enabled ? 'true' : 'false'} />
            <input type="hidden" name={`rows.${index}.cityName`} value={row.cityName} />
            <input type="hidden" name={`rows.${index}.districtName`} value={row.districtName} />
            <input type="hidden" name={`rows.${index}.name`} value={row.name} />
            <input type="hidden" name={`rows.${index}.finishing`} value={row.finishing ?? ''} />
            <input type="hidden" name={`rows.${index}.rooms`} value={row.rooms} />
            <input type="hidden" name={`rows.${index}.area`} value={row.area ?? ''} />
            <input type="hidden" name={`rows.${index}.floor`} value={row.floor ?? ''} />
            <input type="hidden" name={`rows.${index}.price`} value={row.price ?? ''} />
          </div>
        ))}
      </div>
    );
  }

  function renderMobileRowCard(row: (typeof rowsWithState)[number]) {
    const isDisabled = !row.enabled;
    const generalIssues = getGeneralIssues(row.issues);

    return (
      <div
        key={row.id}
        className={`rounded-lg border border-slate-200 bg-white p-3 ${
          isDisabled ? 'opacity-60' : ''
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <StatusBadge status={row.status} />
            <div className="text-sm font-medium text-gray-900">{row.name || 'Без названия'}</div>
            <div className="text-xs text-gray-500">
              {row.sourcePage}
              {row.sourceId ? `, ID ${row.sourceId}` : ''}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraftRows((currentRows) =>
                currentRows.filter((currentRow) => currentRow.id !== row.id)
              );
            }}
            aria-label="Удалить строку из черновика"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={row.enabled}
              onChange={(event) => toggleRowSelection(row.id, event.target.checked)}
            />
            Выбран
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FieldStack
            footer={<ResolutionBadge status={row.cityResolution} />}
            issues={getIssuesByField(row.issues, 'cityName')}
          >
            <Label htmlFor={`mobile-city-${row.id}`}>Город</Label>
            <Input
              id={`mobile-city-${row.id}`}
              className="h-10 bg-white"
              value={row.cityName}
              list="city-options"
              onChange={(event) => updateRow(row.id, { cityName: event.target.value })}
            />
          </FieldStack>
          <FieldStack
            footer={<ResolutionBadge status={row.districtResolution} />}
            issues={getIssuesByField(row.issues, 'districtName')}
          >
            <Label htmlFor={`mobile-district-${row.id}`}>Район</Label>
            <Input
              id={`mobile-district-${row.id}`}
              className="h-10 bg-white"
              value={row.districtName}
              list="district-options"
              onChange={(event) => updateRow(row.id, { districtName: event.target.value })}
            />
          </FieldStack>
          <FieldStack issues={getIssuesByField(row.issues, 'name')} className="sm:col-span-2">
            <Label htmlFor={`mobile-name-${row.id}`}>Квартира</Label>
            <Input
              id={`mobile-name-${row.id}`}
              className="h-10 bg-white"
              value={row.name}
              onChange={(event) => updateRow(row.id, { name: event.target.value })}
            />
          </FieldStack>
          <FieldStack issues={getIssuesByField(row.issues, 'rooms')}>
            <Label htmlFor={`mobile-rooms-${row.id}`}>Комнат</Label>
            <Input
              id={`mobile-rooms-${row.id}`}
              className="h-10 bg-white"
              value={row.rooms}
              onChange={(event) => updateRow(row.id, { rooms: event.target.value })}
            />
          </FieldStack>
          <FieldStack issues={getIssuesByField(row.issues, 'area')}>
            <Label htmlFor={`mobile-area-${row.id}`}>Площадь, м2</Label>
            <Input
              id={`mobile-area-${row.id}`}
              className="h-10 bg-white"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={row.area ?? ''}
              onChange={(event) => updateRow(row.id, { area: parseNullableNumber(event.target.value) })}
            />
          </FieldStack>
          <FieldStack issues={getIssuesByField(row.issues, 'floor')}>
            <Label htmlFor={`mobile-floor-${row.id}`}>Этаж</Label>
            <Input
              id={`mobile-floor-${row.id}`}
              className="h-10 bg-white"
              type="number"
              inputMode="numeric"
              step="1"
              value={row.floor ?? ''}
              onChange={(event) => updateRow(row.id, { floor: parseNullableNumber(event.target.value) })}
            />
          </FieldStack>
          <FieldStack
            footer={<span className="text-xs text-gray-500">{formatPrice(row.price)}</span>}
            issues={getIssuesByField(row.issues, 'price')}
          >
            <Label htmlFor={`mobile-price-${row.id}`}>Цена, ₽</Label>
            <Input
              id={`mobile-price-${row.id}`}
              className="h-10 bg-white"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={row.price ?? ''}
              onChange={(event) => updateRow(row.id, { price: parseNullableNumber(event.target.value) })}
            />
          </FieldStack>
          <FieldStack
            footer={
              row.finishing ? (
                <span className="text-xs text-gray-500">{formatFinishingLabel(row.finishing)}</span>
              ) : null
            }
            issues={getIssuesByField(row.issues, 'finishing')}
            className="sm:col-span-2"
          >
            <Label>Отделка</Label>
            <Select
              value={row.finishing ?? undefined}
              onValueChange={(value) =>
                updateRow(row.id, {
                  finishing: value as DraftRow['finishing'],
                })
              }
            >
              <SelectTrigger className="h-10 bg-white">
                <SelectValue placeholder="Отделка" />
              </SelectTrigger>
              <SelectContent>
                {FINISHING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldStack>
        </div>

        <div className="mt-3 space-y-1 text-xs text-gray-500">
          <div>{row.hasLayoutImage ? 'Планировка есть' : 'Без планировки'}</div>
          <div>{row.hasLocationImage ? 'Геолокация есть' : 'Без геолокации'}</div>
        </div>
        {generalIssues.length > 0 && (
          <div className="mt-3 space-y-1">
            <IssueMessages issues={generalIssues} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Параметры импорта</CardTitle>
          <CardDescription>
            Город и район можно оставить пустыми: система попробует взять их из PDF. Если справочников
            нет в базе, они будут созданы только после подтверждения черновика.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={analyzeApartmentPdfImportFromPageAction} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="defaultCityName">Город по умолчанию</Label>
              <Input
                id="defaultCityName"
                name="cityName"
                list="city-options"
                value={defaultCityName}
                onChange={(event) => {
                  setDefaultCityName(event.target.value);
                  resetPreview();
                }}
                placeholder="Например, Санкт-Петербург"
              />
              <datalist id="city-options">
                {cities.map((city) => (
                  <option key={city.id} value={city.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultDistrictName">Район по умолчанию</Label>
              <Input
                id="defaultDistrictName"
                name="districtName"
                list="district-options"
                value={defaultDistrictName}
                onChange={(event) => {
                  setDefaultDistrictName(event.target.value);
                  resetPreview();
                }}
                placeholder="Например, Приморский район"
              />
              <datalist id="district-options">
                {districtSuggestions.map((districtName) => (
                  <option key={districtName} value={districtName} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Режим анализа</Label>
              <input type="hidden" name="mode" value="rules" />
              <Select value="rules" disabled>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Правила без ИИ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rules">Правила без ИИ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="pdfFile">PDF-файл</Label>
                <Input
                  id="pdfFile"
                  name="pdfFile"
                  ref={pdfFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handlePdfFileChange}
                  onInput={handlePdfFileChange}
                />
                {pdfFile && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="h-4 w-4" />
                    <span>{pdfFile.name}</span>
                    <span className="text-gray-400">({formatBytes(pdfFile.size)})</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                onClick={(event) => {
                  event.preventDefault();
                  void handleAnalyze();
                }}
                disabled={!canAnalyze}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="h-4 w-4" />
                )}
                Запустить анализ
              </Button>
            </div>
            {isAnalyzing && (
              <div className="mt-4 space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Анализ PDF выполняется
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.max(5, analyzeJob?.progress ?? 5)}%` }}
                  />
                </div>
                <div>
                  {analyzeJob?.stage ? `Этап: ${analyzeJob.stage}. ` : ''}
                  Прогресс: {(analyzeJob?.progress ?? 0).toLocaleString('ru-RU')}%.
                </div>
              </div>
            )}
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Не удалось продолжить</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          </form>
        </CardContent>
      </Card>

      {rowsWithState.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryTile
            label="Всего"
            value={rowsWithState.length}
            className="border-slate-200 bg-white text-slate-700"
          />
          <SummaryTile
            label="Выбрано"
            value={enabledRows.length}
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          />
          <SummaryTile
            label="Проверить"
            value={reviewRows.length}
            className="border-amber-200 bg-amber-50 text-amber-700"
          />
          <SummaryTile
            label="Ошибки"
            value={blockingRows.length}
            className="border-red-200 bg-red-50 text-red-700"
          />
          <SummaryTile
            label="Новые города"
            value={createdCityNames.size}
            className="border-blue-200 bg-blue-50 text-blue-700"
          />
          <SummaryTile
            label="Новые районы"
            value={createdDistrictNames.size}
            className="border-blue-200 bg-blue-50 text-blue-700"
          />
        </div>
      )}

      {rowsWithState.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Черновик импорта</CardTitle>
              <CardDescription>
                Проверьте распознанные данные. Галочка «Выбран» выбирает строки для массовых
                действий и определяет, какие квартиры будут созданы.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  'all',
                  'ready',
                  'warning',
                  'error',
                  'duplicate',
                  'selected',
                  'new-location',
                ] as PreviewFilter[]
              ).map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={previewFilter === item ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewFilter(item)}
                >
                  {previewFilterLabels[item]}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="bulkCityName">Город для выбранных</Label>
                  <select
                    id="bulkCityName"
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    value={bulkCityName}
                    onChange={(event) => handleBulkCityChange(event.target.value)}
                  >
                    <option value="">Не менять город</option>
                    {cities.map((city) => (
                      <option key={city.id} value={city.name}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="bulkDistrictName">Район для выбранных</Label>
                  <select
                    id="bulkDistrictName"
                    className="h-9 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    value={bulkDistrictName}
                    onChange={(event) => handleBulkDistrictChange(event.target.value)}
                  >
                    <option value="">Не менять район</option>
                    {bulkDistrictSuggestions.map((districtName) => (
                      <option key={districtName} value={districtName}>
                        {districtName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 w-full whitespace-normal"
                  onClick={applyBulkLocationToSelectedRows}
                  disabled={selectedRows.length === 0}
                >
                  <MapPin className="h-4 w-4" />
                  Применить к выбранным
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="min-w-0 text-sm text-gray-600">
                Выбрано {selectedRows.length.toLocaleString('ru-RU')} из{' '}
                {rowsWithState.length.toLocaleString('ru-RU')}. В фильтре:{' '}
                {visibleRows.length.toLocaleString('ru-RU')}.
              </div>
              <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 w-full whitespace-normal"
                  onClick={applyDefaultsToMissingRows}
                >
                  <MapPin className="h-4 w-4" />
                  Заполнить пустые
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 w-full whitespace-normal"
                  onClick={excludeErrorRowsFromImport}
                  disabled={blockingRows.length === 0}
                >
                  <EyeOff className="h-4 w-4" />
                  Исключить ошибки
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 w-full whitespace-normal"
                  onClick={deleteSelectedErrorRows}
                  disabled={selectedErrorRows.length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Удалить выбранные ошибки
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 w-full whitespace-normal"
                  onClick={resetPreview}
                >
                  <RotateCcw className="h-4 w-4" />
                  Сбросить preview
                </Button>
              </div>
            </div>

            <div className="space-y-3 xl:hidden">
              {visibleRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-gray-500">
                  В текущем фильтре нет строк.
                </div>
              ) : (
                visibleRows.map((row) => renderMobileRowCard(row))
              )}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white xl:block">
              <Table className="min-w-[2480px]">
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-24 whitespace-normal">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allVisibleRowsSelected}
                        onChange={(event) => setVisibleRowsSelection(event.target.checked)}
                        aria-label="Выбрать строки текущего фильтра"
                      />
                      <span className="ml-2 align-middle">Выбран</span>
                    </TableHead>
                    <TableHead className="w-36 whitespace-normal">Статус</TableHead>
                    <TableHead className="w-32 whitespace-normal">Источник</TableHead>
                    <TableHead className="w-[260px] whitespace-normal">Город</TableHead>
                    <TableHead className="w-[300px] whitespace-normal">Район</TableHead>
                    <TableHead className="w-[430px] whitespace-normal">Квартира</TableHead>
                    <TableHead className="w-[150px] whitespace-normal">Комнат</TableHead>
                    <TableHead className="w-[170px] whitespace-normal">Площадь, м2</TableHead>
                    <TableHead className="w-[140px] whitespace-normal">Этаж</TableHead>
                    <TableHead className="w-[190px] whitespace-normal">Цена, ₽</TableHead>
                    <TableHead className="w-[240px] whitespace-normal">Отделка</TableHead>
                    <TableHead className="w-[320px] whitespace-normal">Замечания</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-8 text-center text-sm text-gray-500">
                        В текущем фильтре нет строк.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleRows.map((row) => {
                    const isDisabled = !row.enabled;
                    const generalIssues = getGeneralIssues(row.issues);

                    return (
                      <TableRow
                        key={row.id}
                        className={isDisabled ? 'bg-slate-50 opacity-60' : ''}
                      >
                        <TableCell className="align-top whitespace-normal py-4">
                          <input
                            form="confirm-import-form"
                            type="hidden"
                            name={`row.${row.id}.enabled`}
                            value="false"
                          />
                          <input
                            form="confirm-import-form"
                            name={`row.${row.id}.enabled`}
                            type="checkbox"
                            value="true"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={row.enabled}
                            onChange={(event) => toggleRowSelection(row.id, event.target.checked)}
                            aria-label="Выбрать строку"
                          />
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <div className="space-y-2">
                            <StatusBadge status={row.status} />
                            <div className="text-xs leading-snug text-gray-500">
                              {row.enabled ? 'Будет импортирована' : 'Исключена'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          {row.sourcePage}
                          {row.sourceId && (
                            <div className="mt-1 text-xs text-gray-500">ID {row.sourceId}</div>
                          )}
                          <div className="mt-1 space-y-1 text-xs text-gray-500">
                            <div>{row.hasLayoutImage ? 'Планировка есть' : 'Без планировки'}</div>
                            <div>{row.hasLocationImage ? 'Геолокация есть' : 'Без геолокации'}</div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack
                            footer={<ResolutionBadge status={row.cityResolution} />}
                            issues={getIssuesByField(row.issues, 'cityName')}
                          >
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.cityName`}
                              className="h-10 min-w-[220px] bg-white"
                              value={row.cityName}
                              list="city-options"
                              onChange={(event) =>
                                updateRow(row.id, { cityName: event.target.value })
                              }
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack
                            footer={<ResolutionBadge status={row.districtResolution} />}
                            issues={getIssuesByField(row.issues, 'districtName')}
                          >
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.districtName`}
                              className="h-10 min-w-[260px] bg-white"
                              value={row.districtName}
                              list="district-options"
                              onChange={(event) =>
                                updateRow(row.id, { districtName: event.target.value })
                              }
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack issues={getIssuesByField(row.issues, 'name')}>
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.name`}
                              className="h-10 min-w-[390px] bg-white"
                              value={row.name}
                              onChange={(event) => updateRow(row.id, { name: event.target.value })}
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack issues={getIssuesByField(row.issues, 'rooms')}>
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.rooms`}
                              className="h-10 min-w-[110px] bg-white"
                              value={row.rooms}
                              onChange={(event) => updateRow(row.id, { rooms: event.target.value })}
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack issues={getIssuesByField(row.issues, 'area')}>
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.area`}
                              className="h-10 min-w-[120px] bg-white"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              value={row.area ?? ''}
                              onChange={(event) =>
                                updateRow(row.id, { area: parseNullableNumber(event.target.value) })
                              }
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack issues={getIssuesByField(row.issues, 'floor')}>
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.floor`}
                              className="h-10 min-w-[95px] bg-white"
                              type="number"
                              inputMode="numeric"
                              step="1"
                              value={row.floor ?? ''}
                              onChange={(event) =>
                                updateRow(row.id, { floor: parseNullableNumber(event.target.value) })
                              }
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack
                            footer={
                              <span className="text-xs text-gray-500">{formatPrice(row.price)}</span>
                            }
                            issues={getIssuesByField(row.issues, 'price')}
                          >
                            <Input
                              form="confirm-import-form"
                              name={`row.${row.id}.price`}
                              className="h-10 min-w-[150px] bg-white"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              value={row.price ?? ''}
                              onChange={(event) =>
                                updateRow(row.id, { price: parseNullableNumber(event.target.value) })
                              }
                            />
                          </FieldStack>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <FieldStack
                            footer={
                              row.finishing ? (
                                <span className="text-xs text-gray-500">
                                  {formatFinishingLabel(row.finishing)}
                                </span>
                              ) : null
                            }
                            issues={getIssuesByField(row.issues, 'finishing')}
                          >
                            <input
                              form="confirm-import-form"
                              type="hidden"
                              name={`row.${row.id}.finishing`}
                              value={row.finishing ?? ''}
                            />
                            <Select
                              value={row.finishing ?? undefined}
                              onValueChange={(value) =>
                                updateRow(row.id, {
                                  finishing: value as DraftRow['finishing'],
                                })
                              }
                            >
                              <SelectTrigger className="h-10 min-w-[200px] bg-white">
                                <SelectValue placeholder="Отделка" />
                              </SelectTrigger>
                              <SelectContent>
                                {FINISHING_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldStack>
                        </TableCell>
                        <TableCell className="max-w-md align-top whitespace-normal py-4">
                          {generalIssues.length > 0 ? (
                            <div className="space-y-1">
                              {generalIssues.map((issue, index) => (
                                <div
                                  key={`${row.id}-${issue.message}-${index}`}
                                  className={
                                    issue.severity === 'error'
                                      ? 'text-sm text-red-700'
                                      : 'text-sm text-amber-700'
                                  }
                                >
                                  {issue.message}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">Нет</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top whitespace-normal py-4">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDraftRows((currentRows) =>
                                currentRows.filter((currentRow) => currentRow.id !== row.id)
                              );
                            }}
                            aria-label="Удалить строку из черновика"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {rowsWithState.length > 0 && (
        <form id="confirm-import-form" action={confirmApartmentPdfImportFromPageAction}>
          <Card className="border-0 shadow-lg">
            <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
              {renderConfirmFallbackInputs()}
              <div className="text-sm text-gray-600">
                Выбрано к импорту {enabledRows.length.toLocaleString('ru-RU')} строк. Требуют проверки:{' '}
                {reviewRows.length.toLocaleString('ru-RU')}.
                {createdCityNames.size > 0 &&
                  ` Новых городов: ${createdCityNames.size.toLocaleString('ru-RU')}.`}
                {createdDistrictNames.size > 0 &&
                  ` Новых районов: ${createdDistrictNames.size.toLocaleString('ru-RU')}.`}
                {duplicateRows > 0 &&
                  ` Дубликатов в preview: ${duplicateRows.toLocaleString('ru-RU')}.`}
              </div>
              <Button
                type="submit"
                onClick={(event) => {
                  event.preventDefault();
                  openImportConfirmation();
                }}
                disabled={!canImport}
              >
                <Upload className="h-4 w-4" />
                Подтвердить импорт
              </Button>
            </CardContent>
          </Card>
        </form>
      )}

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Подтвердить импорт квартир</DialogTitle>
            <DialogDescription>
              Проверьте итог перед созданием объектов. После подтверждения строки будут отправлены в
              импорт.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryTile
              label="Квартир к созданию"
              value={expectedCreatedRows}
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
            <SummaryTile
              label="Строк отправится"
              value={enabledRows.length}
              className="border-slate-200 bg-white text-slate-700"
            />
            <SummaryTile
              label="Предупреждения"
              value={reviewRows.length}
              className="border-amber-200 bg-amber-50 text-amber-700"
            />
            <SummaryTile
              label="Дубликаты"
              value={enabledDuplicateRows.length}
              className="border-slate-200 bg-slate-50 text-slate-700"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="mb-2 text-sm font-medium text-blue-900">
                Новые города: {createdCityNameList.length.toLocaleString('ru-RU')}
              </div>
              <LimitedNameList items={createdCityNameList} emptyLabel="Новых городов нет" />
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="mb-2 text-sm font-medium text-blue-900">
                Новые районы: {createdDistrictNameList.length.toLocaleString('ru-RU')}
              </div>
              <LimitedNameList items={createdDistrictNameList} emptyLabel="Новых районов нет" />
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Дубликатов в preview всего: {duplicateRows.toLocaleString('ru-RU')}. Выбрано к импорту:{' '}
            {enabledDuplicateRows.length.toLocaleString('ru-RU')}. Строк с предупреждениями:{' '}
            {reviewRows.length.toLocaleString('ru-RU')}.
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmDialogOpen(false)}
              disabled={isImporting}
            >
              Вернуться к проверке
            </Button>
            <Button type="button" onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Импортировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importResult?.rows && (
        <Alert variant={importResult.success ? 'default' : 'destructive'}>
          {importResult.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertTitle>
            {importResult.success ? 'Импорт завершен' : 'Импорт завершился с ошибками'}
          </AlertTitle>
          <AlertDescription>
            <div className="space-y-4">
              <div>
                Добавлено: {(importResult.importedCount ?? 0).toLocaleString('ru-RU')}. Дубликаты:{' '}
                {(importResult.skippedDuplicates ?? 0).toLocaleString('ru-RU')}. Ошибки:{' '}
                {(importResult.failedCount ?? 0).toLocaleString('ru-RU')}.
              </div>
              <div className="grid gap-4">
                <ReportRowsSection title="Ошибки" rows={failedReportRows} tone="red" />
                <ReportRowsSection title="Дубликаты" rows={duplicateReportRows} tone="slate" />
                <ReportRowsSection
                  title="Созданы с предупреждениями"
                  rows={warningCreatedReportRows.map((row) => ({
                    ...row,
                    messages: row.messages.length > 0 ? row.messages : ['Создано, проверьте строку'],
                  }))}
                  tone="amber"
                />
                <ReportRowsSection
                  title="Созданы без предупреждений"
                  rows={createdReportRows.map((row) => ({
                    ...row,
                    messages: ['Создано'],
                  }))}
                  tone="emerald"
                />
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
