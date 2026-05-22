'use server';

import { randomUUID } from 'crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  apartments,
  cities,
  districts,
  type City,
  type District,
  type NewApartment,
  type NewCity,
  type NewDistrict,
} from '@/lib/db/schema';
import { assertRole } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/actions';
import { createApartmentSchema, FINISHING_TYPES } from '@/lib/validators';
import { getEntityDir, saveFileToEntityDir, deleteFile } from '@/lib/storage';
import {
  extractApartmentPdfImagesForPageFromBuffer,
  getApartmentPdfParserProvider,
  parseApartmentPdf,
  type ApartmentPdfPreviewRow,
  type ApartmentPdfParseResult,
} from '@/lib/apartments/pdf-import';
import {
  recordApartmentImportHistory,
  type RecordApartmentImportHistoryRowInput,
} from '@/lib/apartments/import-history';

const analyzeSchema = z.object({
  districtId: z.string().uuid(),
});
const analyzeImportSchema = z.object({
  cityId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  cityName: z.string().trim().max(100).optional(),
  districtName: z.string().trim().max(100).optional(),
  mode: z.enum(['rules', 'hybrid']).default('rules'),
});
const confirmImportRowSchema = z.object({
  rowId: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  cityName: z.string().trim().min(2, 'Укажите город').max(100),
  districtName: z.string().trim().min(2, 'Укажите район').max(100),
  name: z.string().trim().min(2, 'Укажите название квартиры').max(200),
  finishing: z.enum(FINISHING_TYPES, {
    message: 'Выберите корректный тип отделки',
  }),
  rooms: z.string().trim().min(1, 'Укажите количество комнат').max(10),
  area: z.coerce.number().positive('Площадь должна быть больше 0').max(1000),
  floor: z.coerce.number().int('Этаж должен быть целым числом').min(-10).max(200),
  price: z.coerce
    .number()
    .int('Цена должна быть указана в целых рублях')
    .positive('Цена должна быть больше 0')
    .max(1_000_000_000),
});
const confirmImportSchema = z.object({
  importId: z.string().min(1),
  mode: z.enum(['rules', 'hybrid']).optional(),
  rows: z.array(confirmImportRowSchema).min(1).max(300),
});
const analyzeImportJobSchema = z.object({
  jobId: z.string().uuid(),
});
const CONFIRM_CACHE_TTL_MS = 30 * 60 * 1000;
const PDF_IMPORT_JOB_TTL_MS = 30 * 60 * 1000;
const PDF_IMPORT_CACHE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  '.apartment-import-cache'
);
const CORRECTABLE_IMPORT_ISSUE_FIELDS = new Set([
  'cityName',
  'districtName',
  'name',
  'finishing',
  'rooms',
  'area',
  'floor',
  'price',
]);
const APARTMENT_IMPORT_DEDUPE_CONSTRAINT = 'apartments_active_import_dedupe_idx';

interface PdfImportActionResult {
  success: boolean;
  error?: string;
}

export interface AnalyzeApartmentsPdfResult extends PdfImportActionResult {
  result?: ApartmentPdfParseResult;
}

export type ApartmentImportMode = z.infer<typeof analyzeImportSchema>['mode'];
export type ApartmentImportRowStatus = 'ready' | 'warning' | 'error' | 'duplicate';
export type DirectoryResolutionStatus = 'existing' | 'create' | 'missing';

export interface ApartmentImportPreviewIssue {
  field?: string;
  severity: 'warning' | 'error';
  message: string;
}

export interface ApartmentImportPreviewRow {
  id: string;
  rowNumber: number;
  sourcePage: number;
  sourceId?: string;
  status: ApartmentImportRowStatus;
  cityName: string;
  districtName: string;
  cityResolution: DirectoryResolutionStatus;
  districtResolution: DirectoryResolutionStatus;
  name: string;
  finishing: (typeof FINISHING_TYPES)[number] | null;
  rooms: string;
  area: number | null;
  floor: number | null;
  price: number | null;
  hasLayoutImage: boolean;
  hasLocationImage: boolean;
  confidence: number | null;
  issues: ApartmentImportPreviewIssue[];
}

export interface AnalyzeApartmentPdfImportResult extends PdfImportActionResult {
  backendStatus: 'connected' | 'not_configured';
  importId?: string;
  mode?: ApartmentImportMode;
  context?: {
    cityId?: string;
    districtId?: string;
    cityName?: string;
    districtName?: string;
  };
  rows?: ApartmentImportPreviewRow[];
  summary?: {
    totalRows: number;
    readyRows: number;
    warningRows: number;
    errorRows: number;
  };
}

export type ApartmentImportAnalyzeJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ApartmentImportAnalyzeJobSnapshot extends PdfImportActionResult {
  jobId: string;
  status: ApartmentImportAnalyzeJobStatus;
  progress: number;
  stage: string;
  result?: AnalyzeApartmentPdfImportResult;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmApartmentPdfImportResult extends PdfImportActionResult {
  importedCount?: number;
  skippedDuplicates?: number;
  failedCount?: number;
  rows?: NonNullable<ImportApartmentsPdfResult['report']>['importedRows'];
}

interface CachedPdfImport {
  createdAt: number;
  actorUserId: string;
  fileBuffer: Buffer;
  fileName: string;
  fileHash: string;
  mode: ApartmentImportMode;
  parserProvider: string;
  context: {
    cityId?: string;
    districtId?: string;
    cityName?: string;
    districtName?: string;
  };
  rows: ApartmentPdfPreviewRow[];
}

interface CachedPdfImportMetadata extends Omit<CachedPdfImport, 'fileBuffer'> {
  pdfFileName: string;
}

interface ConfirmApartmentPdfImportInput {
  importId: string;
  mode?: ApartmentImportMode;
  context?: {
    cityId?: string;
    districtId?: string;
  };
  rows: Array<z.input<typeof confirmImportRowSchema>>;
}

type AnalyzeApartmentPdfImportContext = z.infer<typeof analyzeImportSchema>;
type ConfirmApartmentPdfImportPayload = z.infer<typeof confirmImportSchema>;
type ImportApartmentsPdfReport = NonNullable<ImportApartmentsPdfResult['report']>;

interface ApartmentImportAnalyzeJobState extends ApartmentImportAnalyzeJobSnapshot {
  actorUserId: string;
}

interface AnalyzeApartmentPdfImportBufferInput {
  currentSession: Awaited<ReturnType<typeof assertRole>>;
  context: AnalyzeApartmentPdfImportContext;
  fileBuffer: Buffer;
  fileName: string;
  onProgress?: (progress: number, stage: string) => void;
}

const pdfImportAnalyzeJobs = new Map<string, ApartmentImportAnalyzeJobState>();

interface ApartmentDuplicateLookup {
  name: string;
  area: number | null;
  floor: number | null;
  price: number | null;
}

export interface ImportApartmentsPdfResult extends PdfImportActionResult {
  report?: {
    created: number;
    skippedDuplicates: number;
    failed: number;
    importedRows: Array<{
      rowId: string;
      name: string;
      apartmentId?: string;
      status: 'created' | 'duplicate' | 'failed';
      message?: string;
    }>;
  };
}

export async function analyzeApartmentsPdfAction(
  formData: FormData
): Promise<AnalyzeApartmentsPdfResult> {
  try {
    await assertRole(['admin', 'moderator']);

    const { districtId } = analyzeSchema.parse({
      districtId: formData.get('districtId'),
    });
    await ensureDistrictExists(districtId);

    const file = getPdfFile(formData);
    const parsed = await parseApartmentPdf(file);
    const rows = await markDuplicateRows(parsed.rows, districtId);

    return {
      success: true,
      result: {
        ...parsed,
        rows,
        summary: {
          ...parsed.summary,
          ready: rows.filter((row) => row.status === 'ready').length,
          warnings: rows.filter((row) => row.status === 'warning').length,
          errors: rows.filter((row) => row.status === 'error').length,
        },
      },
    };
  } catch (error) {
    console.error('Analyze apartments PDF error:', error);
    return {
      success: false,
      error: getUserFacingError(error, 'Не удалось обработать PDF'),
    };
  }
}

export async function analyzeApartmentPdfImportAction(
  formData: FormData
): Promise<AnalyzeApartmentPdfImportResult> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);
    await prunePdfImportCache();

    const file = getPdfFile(formData);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    return await analyzeApartmentPdfImportFromBuffer({
      currentSession,
      context: parseAnalyzeImportContext(formData),
      fileBuffer,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Analyze apartment PDF import error:', error);
    return {
      success: false,
      backendStatus: 'connected',
      error: getUserFacingError(error, 'Не удалось обработать PDF'),
    };
  }
}

export async function getApartmentPdfImportPreviewAction(
  importId: string
): Promise<AnalyzeApartmentPdfImportResult> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);
    await prunePdfImportCache();

    const cachedImport = await readPdfImportCache(importId);
    if (!cachedImport) {
      return {
        success: false,
        backendStatus: 'connected',
        error: 'Preview импорта устарел. Запустите анализ PDF заново.',
      };
    }
    if (cachedImport.actorUserId !== currentSession.userId) {
      return {
        success: false,
        backendStatus: 'connected',
        error: 'Этот preview импорта создан другим пользователем',
      };
    }

    const rows = await Promise.all(cachedImport.rows.map(mapPreviewRowForClient));

    return {
      success: true,
      backendStatus: 'connected',
      importId,
      mode: cachedImport.mode,
      context: cachedImport.context,
      rows,
      summary: buildClientSummary(rows),
    };
  } catch (error) {
    console.error('Get apartment PDF import preview error:', error);
    return {
      success: false,
      backendStatus: 'connected',
      error: getUserFacingError(error, 'Не удалось загрузить preview импорта'),
    };
  }
}

export async function startApartmentPdfImportAnalyzeJobAction(
  formData: FormData
): Promise<ApartmentImportAnalyzeJobSnapshot> {
  'use server';

  try {
    const currentSession = await assertRole(['admin', 'moderator']);
    prunePdfImportAnalyzeJobs();
    await prunePdfImportCache();

    const file = getPdfFile(formData);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const context = parseAnalyzeImportContext(formData);
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: ApartmentImportAnalyzeJobState = {
      success: true,
      jobId,
      actorUserId: currentSession.userId,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    pdfImportAnalyzeJobs.set(jobId, job);
    setTimeout(() => {
      void runApartmentPdfImportAnalyzeJob(jobId, {
        currentSession,
        context,
        fileBuffer,
        fileName: file.name,
      });
    }, 0);

    return toAnalyzeJobSnapshot(job);
  } catch (error) {
    return {
      success: false,
      jobId: '',
      status: 'failed',
      progress: 100,
      stage: 'failed',
      error: getUserFacingError(error, 'Не удалось запустить анализ PDF'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function getApartmentPdfImportAnalyzeJobAction(
  input: z.input<typeof analyzeImportJobSchema>
): Promise<ApartmentImportAnalyzeJobSnapshot> {
  'use server';

  const currentSession = await assertRole(['admin', 'moderator']);
  prunePdfImportAnalyzeJobs();
  const { jobId } = analyzeImportJobSchema.parse(input);
  const job = pdfImportAnalyzeJobs.get(jobId);

  if (!job || job.actorUserId !== currentSession.userId) {
    return {
      success: false,
      jobId,
      status: 'failed',
      progress: 100,
      stage: 'not_found',
      error: 'PDF import job not found',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return toAnalyzeJobSnapshot(job);
}

async function runApartmentPdfImportAnalyzeJob(
  jobId: string,
  input: AnalyzeApartmentPdfImportBufferInput
) {
  const job = pdfImportAnalyzeJobs.get(jobId);
  if (!job) {
    return;
  }

  updateAnalyzeJob(job, {
    status: 'running',
    progress: 5,
    stage: 'starting',
  });

  try {
    const result = await analyzeApartmentPdfImportFromBuffer({
      ...input,
      onProgress: (progress, stage) => updateAnalyzeJob(job, { progress, stage }),
    });

    updateAnalyzeJob(job, {
      status: result.success ? 'completed' : 'failed',
      progress: 100,
      stage: result.success ? 'completed' : 'failed',
      result,
      error: result.error,
    });
  } catch (error) {
    updateAnalyzeJob(job, {
      status: 'failed',
      progress: 100,
      stage: 'failed',
      error: getUserFacingError(error, 'Не удалось обработать PDF'),
    });
  }
}

async function analyzeApartmentPdfImportFromBuffer(
  input: AnalyzeApartmentPdfImportBufferInput
): Promise<AnalyzeApartmentPdfImportResult> {
  input.onProgress?.(10, 'resolving_location');
  const locationDefaults = await resolveLocationDefaults(input.context);

  input.onProgress?.(25, 'parsing_pdf');
  const parserProvider = getApartmentPdfParserProvider(input.context.mode);
  const parsed = await parserProvider.parse(input.fileBuffer, input.fileName);

  input.onProgress?.(65, 'checking_duplicates');
  const rows = await markDuplicateRowsByLocation(
    applyLocationDefaults(parsed.rows, locationDefaults)
  );

  input.onProgress?.(80, 'building_preview');
  const clientRows = await Promise.all(rows.map(mapPreviewRowForClient));
  const importId = `${parsed.fileHash.slice(0, 16)}-${randomUUID()}`;

  input.onProgress?.(90, 'saving_preview');
  await savePdfImportCache(importId, {
    createdAt: Date.now(),
    actorUserId: input.currentSession.userId,
    fileBuffer: input.fileBuffer,
    fileName: parsed.fileName,
    fileHash: parsed.fileHash,
    mode: input.context.mode,
    parserProvider: parserProvider.id,
    context: {
      cityId: input.context.cityId,
      districtId: input.context.districtId,
      cityName: locationDefaults.cityName,
      districtName: locationDefaults.districtName,
    },
    rows,
  });

  input.onProgress?.(100, 'completed');
  return {
    success: true,
    backendStatus: 'connected',
    importId,
    mode: input.context.mode,
    context: {
      cityId: input.context.cityId,
      districtId: input.context.districtId,
      cityName: locationDefaults.cityName,
      districtName: locationDefaults.districtName,
    },
    rows: clientRows,
    summary: buildClientSummary(clientRows),
  };
}

function parseAnalyzeImportContext(formData: FormData): AnalyzeApartmentPdfImportContext {
  return analyzeImportSchema.parse({
    cityId: emptyStringToUndefined(formData.get('cityId')),
    districtId: emptyStringToUndefined(formData.get('districtId')),
    cityName: emptyStringToUndefined(formData.get('cityName')),
    districtName: emptyStringToUndefined(formData.get('districtName')),
    mode: emptyStringToUndefined(formData.get('mode')) ?? 'rules',
  });
}

function updateAnalyzeJob(
  job: ApartmentImportAnalyzeJobState,
  patch: Partial<Omit<ApartmentImportAnalyzeJobState, 'jobId' | 'actorUserId' | 'createdAt'>>
) {
  Object.assign(job, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function toAnalyzeJobSnapshot(
  job: ApartmentImportAnalyzeJobState
): ApartmentImportAnalyzeJobSnapshot {
  const { actorUserId, ...snapshot } = job;
  void actorUserId;
  return {
    ...snapshot,
  };
}

function prunePdfImportAnalyzeJobs() {
  const expiresBefore = Date.now() - PDF_IMPORT_JOB_TTL_MS;
  for (const [jobId, job] of pdfImportAnalyzeJobs.entries()) {
    if (new Date(job.updatedAt).getTime() < expiresBefore) {
      pdfImportAnalyzeJobs.delete(jobId);
    }
  }
}

export async function confirmApartmentPdfImportAction(
  input: ConfirmApartmentPdfImportInput
): Promise<ConfirmApartmentPdfImportResult> {
  const currentSession = await assertRole(['admin', 'moderator']);
  const report: ImportApartmentsPdfReport = {
    created: 0,
    skippedDuplicates: 0,
    failed: 0,
    importedRows: [],
  };
  let normalizedInput: ConfirmApartmentPdfImportPayload | undefined;
  let cachedImport: CachedPdfImport | null = null;
  let submittedRows: Array<Record<string, unknown> & { rowId: string; enabled?: boolean }> = [];
  const createdCityNames = new Set<string>();
  const createdDistrictNames = new Set<string>();
  let confirmHistoryRecorded = false;
  let shouldDeletePreviewCache = false;

  try {
    await prunePdfImportCache();

    normalizedInput = confirmImportSchema.parse(input);
    cachedImport = await readPdfImportCache(normalizedInput.importId);
    if (!cachedImport) {
      throw new Error('Preview импорта устарел. Запустите анализ PDF заново.');
    }
    if (cachedImport.actorUserId !== currentSession.userId) {
      throw new Error('Этот preview импорта создан другим пользователем');
    }

    shouldDeletePreviewCache = true;

    const cachedRowsById = new Map(cachedImport.rows.map((row) => [row.rowId, row]));
    const providedRows = normalizedInput.rows as Array<
      Record<string, unknown> & { rowId: string; enabled?: boolean }
    >;
    submittedRows = providedRows.filter((row) => row.enabled !== false);

    if (submittedRows.length === 0) {
      throw new Error('В preview нет строк для импорта');
    }

    for (const rowInput of submittedRows) {
      const rowValidation = confirmImportRowSchema.safeParse(rowInput);
      if (!rowValidation.success) {
        report.failed += 1;
        report.importedRows.push({
          rowId: rowInput.rowId,
          name: 'Строка импорта',
          status: 'failed',
          message: rowValidation.error.issues[0]?.message || 'Ошибка валидации',
        });
        continue;
      }

      const row = rowValidation.data;
      const sourceRow = cachedRowsById.get(row.rowId);
      if (!sourceRow) {
        report.failed += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name,
          status: 'failed',
          message: 'Строка не найдена в сохраненном preview',
        });
        continue;
      }

      const blockingSourceErrors = sourceRow.errors.filter(
        (message) => !isCorrectablePreviewIssue(message)
      );
      if (blockingSourceErrors.length > 0) {
        report.failed += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name,
          status: 'failed',
          message: blockingSourceErrors.join('; ') || 'Строка содержит ошибки распознавания',
        });
        continue;
      }

      const resolvedCity = await getOrCreateCity(row.cityName, currentSession);
      if (resolvedCity.created) {
        createdCityNames.add(resolvedCity.city.name);
      }

      const resolvedDistrict = await getOrCreateDistrict(
        resolvedCity.city.id,
        row.districtName,
        currentSession
      );
      if (resolvedDistrict.created) {
        createdDistrictNames.add(`${resolvedCity.city.name} / ${resolvedDistrict.district.name}`);
      }

      const duplicate = await findActiveApartmentDuplicate(resolvedDistrict.district.id, row);
      if (duplicate) {
        report.skippedDuplicates += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name,
          status: 'duplicate',
          message: 'Квартира уже есть в этом городе и районе',
        });
        continue;
      }

      const validation = createApartmentSchema.safeParse({
        districtId: resolvedDistrict.district.id,
        name: row.name,
        finishing: row.finishing,
        rooms: row.rooms,
        area: row.area,
        floor: row.floor,
        price: row.price,
        photos: [],
      });

      if (!validation.success) {
        report.failed += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name || `Строка ${sourceRow.pageNumber}`,
          status: 'failed',
          message: validation.error.issues[0]?.message || 'Ошибка валидации',
        });
        continue;
      }

      let created: Awaited<ReturnType<typeof createImportedApartment>>;
      try {
        created = await createImportedApartment(validation.data);
      } catch (error) {
        if (isApartmentImportUniqueDuplicateError(error)) {
          report.skippedDuplicates += 1;
          report.importedRows.push({
            rowId: row.rowId,
            name: row.name,
            status: 'duplicate',
            message: 'Квартира уже была создана параллельным импортом',
          });
          continue;
        }

        throw error;
      }
      const photoWarning = await attachCachedPdfImages(
        created.id,
        cachedImport.fileBuffer,
        sourceRow
      );

      report.created += 1;
      report.importedRows.push({
        rowId: row.rowId,
        name: row.name,
        apartmentId: created.id,
        status: 'created',
        message: photoWarning,
      });
    }

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'apartments.pdf_import',
      entityType: 'apartment_import',
      entityLabel: cachedImport.fileName,
      details: {
        fileHash: cachedImport.fileHash,
        fileName: cachedImport.fileName,
        mode: normalizedInput.mode ?? cachedImport.mode,
        totalRows: cachedImport.rows.length,
        submittedRows: submittedRows.length,
        created: report.created,
        createdCities: [...createdCityNames],
        createdDistricts: [...createdDistrictNames],
        skippedDuplicates: report.skippedDuplicates,
        failed: report.failed,
      },
    });
    await safeRecordConfirmImportHistory({
      currentSession,
      input,
      normalizedInput,
      cachedImport,
      submittedRows,
      report,
      createdCityNames,
      createdDistrictNames,
    });
    confirmHistoryRecorded = true;

    revalidatePath('/dashboard/cities');
    revalidatePath('/dashboard/districts');
    revalidatePath('/dashboard/apartments');

    return {
      success: report.created > 0 && report.failed === 0,
      importedCount: report.created,
      skippedDuplicates: report.skippedDuplicates,
      failedCount: report.failed,
      rows: report.importedRows,
      error: report.created > 0 ? undefined : 'Нет созданных квартир',
    };
  } catch (error) {
    console.error('Confirm apartment PDF import error:', error);
    if (!confirmHistoryRecorded) {
      await safeRecordConfirmImportHistory({
        currentSession,
        input,
        normalizedInput,
        cachedImport,
        submittedRows,
        report,
        createdCityNames,
        createdDistrictNames,
        error,
      });
    }

    return {
      success: false,
      error: getUserFacingError(error, 'Не удалось подтвердить импорт'),
      importedCount: report.created,
      skippedDuplicates: report.skippedDuplicates,
      failedCount: report.failed,
      rows: report.importedRows,
    };
  } finally {
    if (shouldDeletePreviewCache && normalizedInput) {
      try {
        await deletePdfImportCache(normalizedInput.importId);
      } catch (cacheError) {
        console.warn('Failed to delete apartment PDF import cache:', cacheError);
      }
    }
  }
}

export async function importApartmentsPdfAction(
  formData: FormData
): Promise<ImportApartmentsPdfResult> {
  const currentSession = await assertRole(['admin', 'moderator']);
  const report: NonNullable<ImportApartmentsPdfResult['report']> = {
    created: 0,
    skippedDuplicates: 0,
    failed: 0,
    importedRows: [],
  };

  try {
    const { districtId } = analyzeSchema.parse({
      districtId: formData.get('districtId'),
    });
    await ensureDistrictExists(districtId);

    const selectedRowIds = parseSelectedRowIds(formData.get('rowIds'));
    const file = getPdfFile(formData);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseApartmentPdf(fileBuffer, file.name);
    const rows = await markDuplicateRows(parsed.rows, districtId);
    const rowsToImport = selectedRowIds
      ? rows.filter((row) => selectedRowIds.has(row.rowId))
      : rows;

    for (const row of rowsToImport) {
      if (row.errors.length > 0 || row.status === 'error') {
        report.failed += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name || `Строка ${row.pageNumber}`,
          status: 'failed',
          message: row.errors.join('; ') || 'Строка содержит ошибки',
        });
        continue;
      }

      if (row.status === 'duplicate') {
        report.skippedDuplicates += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name,
          status: 'duplicate',
          message: 'Квартира уже есть в выбранном районе',
        });
        continue;
      }

      const validation = createApartmentSchema.safeParse({
        districtId,
        name: row.name,
        finishing: row.finishing,
        rooms: row.rooms,
        area: row.area,
        floor: row.floor,
        price: row.price,
        photos: [],
      });

      if (!validation.success) {
        report.failed += 1;
        report.importedRows.push({
          rowId: row.rowId,
          name: row.name || `Строка ${row.pageNumber}`,
          status: 'failed',
          message: validation.error.issues[0]?.message || 'Ошибка валидации',
        });
        continue;
      }

      const created = await createImportedApartment(validation.data);
      let photoWarning: string | undefined;

      if (row.hasLayoutImage || row.hasLocationImage) {
        try {
          const images = await extractApartmentPdfImagesForPageFromBuffer(fileBuffer, row.pageNumber);
          const photoPaths: string[] = [];
          if (images.layoutImage) {
            const entityDir = await getEntityDir({
              entityType: 'apartments',
              entityId: created.id,
            });
            photoPaths.push(await saveFileToEntityDir(
              entityDir,
              images.layoutImage,
              `layout-${row.sourceId || row.pageNumber}.jpg`
            ));
            if (images.locationImage) {
              photoPaths.push(await saveFileToEntityDir(
                entityDir,
                images.locationImage,
                `location-${row.sourceId || row.pageNumber}.jpg`
              ));
            }
            await db
              .update(apartments)
              .set({ photos: photoPaths, updatedAt: new Date() })
              .where(eq(apartments.id, created.id));
          } else if (images.locationImage) {
            photoWarning = 'Квартира создана, но планировка не найдена; геолокация не прикреплена без планировки';
          }
        } catch (error) {
          photoWarning = 'Квартира создана, но изображения из PDF не удалось сохранить';
          console.warn('Failed to attach PDF images from PDF import:', error);
        }
      }

      report.created += 1;
      report.importedRows.push({
        rowId: row.rowId,
        name: row.name,
        apartmentId: created.id,
        status: 'created',
        message: photoWarning,
      });
    }

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'apartments.pdf_import',
      entityType: 'apartment_import',
      entityLabel: parsed.fileName,
      details: {
        districtId,
        fileHash: parsed.fileHash,
        fileName: parsed.fileName,
        totalRows: rows.length,
        created: report.created,
        skippedDuplicates: report.skippedDuplicates,
        failed: report.failed,
      },
    });

    revalidatePath('/dashboard/apartments');

    return {
      success: true,
      report,
    };
  } catch (error) {
    await Promise.all(
      report.importedRows
        .filter((row) => row.status === 'created' && row.apartmentId)
        .map(async (row) => {
          const [apartment] = await db
            .select()
            .from(apartments)
            .where(eq(apartments.id, row.apartmentId!))
            .limit(1);

          await Promise.all((apartment?.photos ?? []).map((photo) => deleteFile(photo)));
          await db.delete(apartments).where(eq(apartments.id, row.apartmentId!));
        })
    );

    console.error('Import apartments PDF error:', error);
    return {
      success: false,
      error: getUserFacingError(error, 'Не удалось импортировать квартиры'),
      report,
    };
  }
}

async function safeRecordConfirmImportHistory(input: {
  currentSession: Awaited<ReturnType<typeof assertRole>>;
  input: ConfirmApartmentPdfImportInput;
  normalizedInput?: ConfirmApartmentPdfImportPayload;
  cachedImport: CachedPdfImport | null;
  submittedRows: Array<Record<string, unknown> & { rowId: string; enabled?: boolean }>;
  report: ImportApartmentsPdfReport;
  createdCityNames: Set<string>;
  createdDistrictNames: Set<string>;
  error?: unknown;
}) {
  try {
    const mode = input.normalizedInput?.mode ?? input.cachedImport?.mode ?? 'rules';
    const parserProvider = input.cachedImport?.parserProvider ?? getApartmentPdfParserProvider(mode).id;
    const errorMessage = input.error
      ? getUserFacingError(input.error, 'Не удалось подтвердить импорт')
      : undefined;

    await recordApartmentImportHistory({
      actor: {
        userId: input.currentSession.userId,
        login: input.currentSession.login,
        role: input.currentSession.role,
      },
      fileName: input.cachedImport?.fileName ?? `preview-${input.input.importId}`,
      fileHash: input.cachedImport?.fileHash ?? null,
      mode,
      parserProvider,
      totalRows: input.cachedImport?.rows.length ?? input.normalizedInput?.rows.length ?? 0,
      submittedRows: input.submittedRows.length,
      importedRows: input.report.created,
      duplicateRows: input.report.skippedDuplicates,
      errorRows: Math.max(input.report.failed, errorMessage ? 1 : 0),
      previewWarningRows: countPreviewWarningRows(input.cachedImport?.rows ?? []),
      rowWarnings: countImportedRowWarnings(input.report),
      createdCities: [...input.createdCityNames],
      createdDistricts: [...input.createdDistrictNames],
      details: {
        importId: input.normalizedInput?.importId ?? input.input.importId,
        context: input.cachedImport?.context,
        error: errorMessage,
        rows: input.report.importedRows,
      },
      rows: buildConfirmImportHistoryRows(
        input.cachedImport,
        input.submittedRows,
        input.report
      ),
    });
  } catch (historyError) {
    console.warn('Failed to record apartment import history:', historyError);
  }
}

function buildConfirmImportHistoryRows(
  cachedImport: CachedPdfImport | null,
  submittedRows: Array<Record<string, unknown> & { rowId: string; enabled?: boolean }>,
  report: ImportApartmentsPdfReport
): RecordApartmentImportHistoryRowInput[] {
  const cachedRowsById = new Map((cachedImport?.rows ?? []).map((row) => [row.rowId, row]));
  const submittedRowsById = new Map(submittedRows.map((row) => [row.rowId, row]));

  return report.importedRows.map((row) => {
    const sourceRow = cachedRowsById.get(row.rowId);
    const submittedRow = submittedRowsById.get(row.rowId);

    return {
      sourceRowId: row.rowId,
      rowNumber: sourceRow?.pageNumber,
      sourcePage: sourceRow?.pageNumber,
      sourceId: sourceRow?.sourceId,
      apartmentId: row.apartmentId,
      name: row.name,
      cityName: getSubmittedString(submittedRow, 'cityName') ?? sourceRow?.cityName,
      districtName: getSubmittedString(submittedRow, 'districtName') ?? sourceRow?.districtName,
      status: row.status,
      message: row.message,
      warnings: sourceRow?.warnings ?? [],
      errors: sourceRow?.errors ?? [],
      details: {
        hasLayoutImage: sourceRow?.hasLayoutImage ?? false,
        hasLocationImage: sourceRow?.hasLocationImage ?? false,
        sourceTitle: sourceRow?.sourceTitle,
      },
    };
  });
}

function countPreviewWarningRows(rows: ApartmentPdfPreviewRow[]) {
  return rows.filter((row) => row.warnings.length > 0 || row.status === 'warning').length;
}

function countImportedRowWarnings(report: ImportApartmentsPdfReport) {
  return report.importedRows.filter((row) => row.status === 'created' && row.message).length;
}

function getSubmittedString(
  row: (Record<string, unknown> & { rowId: string }) | undefined,
  key: string
) {
  const value = row?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function createImportedApartment(data: z.infer<typeof createApartmentSchema>) {
  const insertData: NewApartment = {
    districtId: data.districtId,
    name: data.name,
    finishing: data.finishing,
    rooms: data.rooms,
    area: data.area,
    floor: data.floor,
    price: data.price.toString(),
    photos: [],
    isActive: true,
  };

  const [created] = await db.insert(apartments).values(insertData).returning();
  if (!created) {
    throw new Error('Не удалось создать квартиру');
  }

  return created;
}

function isApartmentImportUniqueDuplicateError(error: unknown): boolean {
  return hasPostgresUniqueViolation(error, APARTMENT_IMPORT_DEDUPE_CONSTRAINT);
}

function hasPostgresUniqueViolation(
  error: unknown,
  expectedConstraintName: string,
  depth = 0
): boolean {
  if (!error || depth > 3) {
    return false;
  }

  const errorRecord = isRecord(error) ? error : undefined;
  const code = getStringField(errorRecord, 'code');
  const constraintName =
    getStringField(errorRecord, 'constraint_name') ?? getStringField(errorRecord, 'constraint');
  const message =
    error instanceof Error ? error.message : getStringField(errorRecord, 'message') ?? '';
  const matchesExpectedConstraint =
    constraintName === expectedConstraintName || message.includes(expectedConstraintName);

  if (code === '23505' && matchesExpectedConstraint) {
    return true;
  }

  return hasPostgresUniqueViolation(errorRecord?.cause, expectedConstraintName, depth + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

async function markDuplicateRows(
  rows: ApartmentPdfPreviewRow[],
  districtId: string
): Promise<ApartmentPdfPreviewRow[]> {
  const markedRows: ApartmentPdfPreviewRow[] = [];

  for (const row of rows) {
    if (row.errors.length > 0) {
      markedRows.push(row);
      continue;
    }

    const [existing] = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(
        and(
          eq(apartments.districtId, districtId),
          eq(apartments.name, row.name),
          eq(apartments.isActive, true)
        )
      )
      .limit(1);

    if (existing) {
      markedRows.push({
        ...row,
        status: 'duplicate',
        warnings: [...row.warnings, 'Похоже на дубликат в выбранном районе'],
      });
    } else {
      markedRows.push(row);
    }
  }

  return markedRows;
}

async function ensureDistrictExists(districtId: string) {
  const [district] = await db
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.id, districtId), eq(districts.isActive, true)))
    .limit(1);

  if (!district) {
    throw new Error('Выберите существующий активный район');
  }
}

async function resolveLocationDefaults(context: z.infer<typeof analyzeImportSchema>) {
  let cityName = normalizeDirectoryName(context.cityName);
  let districtName = normalizeDirectoryName(context.districtName);

  if (context.districtId) {
    const [district] = await db
      .select({
        id: districts.id,
        name: districts.name,
        cityId: districts.cityId,
        cityName: cities.name,
      })
      .from(districts)
      .innerJoin(cities, eq(cities.id, districts.cityId))
      .where(and(eq(districts.id, context.districtId), eq(districts.isActive, true)))
      .limit(1);

    if (!district) {
      throw new Error('Выбранный район не найден или отключен');
    }

    districtName = districtName || district.name;
    cityName = cityName || district.cityName;
  } else if (context.cityId) {
    const [city] = await db
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .where(and(eq(cities.id, context.cityId), eq(cities.isActive, true)))
      .limit(1);

    if (!city) {
      throw new Error('Выбранный город не найден или отключен');
    }

    cityName = cityName || city.name;
  }

  return {
    cityName,
    districtName,
  };
}

function applyLocationDefaults(
  rows: ApartmentPdfPreviewRow[],
  defaults: { cityName?: string; districtName?: string }
) {
  return rows.map((row) => ({
    ...row,
    cityName: normalizeDirectoryName(row.cityName) || defaults.cityName,
    districtName: normalizeDirectoryName(row.districtName) || defaults.districtName,
  }));
}

async function markDuplicateRowsByLocation(
  rows: ApartmentPdfPreviewRow[]
): Promise<ApartmentPdfPreviewRow[]> {
  const markedRows: ApartmentPdfPreviewRow[] = [];

  for (const row of rows) {
    if (row.errors.length > 0 || !row.cityName || !row.districtName) {
      markedRows.push(row);
      continue;
    }

    const city = await findActiveCityByName(row.cityName);
    const district = city ? await findActiveDistrictByName(city.id, row.districtName) : null;
    const duplicate = district ? await findActiveApartmentDuplicate(district.id, row) : null;

    if (duplicate) {
      markedRows.push({
        ...row,
        status: 'duplicate',
        warnings: [...row.warnings, 'Похоже на дубликат в найденном городе и районе'],
      });
    } else {
      markedRows.push(row);
    }
  }

  return markedRows;
}

async function findActiveCityByName(name: string): Promise<City | null> {
  const normalizedName = normalizeNameForCompare(name);
  if (!normalizedName) {
    return null;
  }

  const activeCities = await db.select().from(cities).where(eq(cities.isActive, true));
  return activeCities.find((city) => normalizeNameForCompare(city.name) === normalizedName) ?? null;
}

async function findActiveDistrictByName(
  cityId: string,
  name: string
): Promise<District | null> {
  const normalizedName = normalizeDistrictNameForCompare(name);
  if (!normalizedName) {
    return null;
  }

  const cityDistricts = await db
    .select()
    .from(districts)
    .where(and(eq(districts.cityId, cityId), eq(districts.isActive, true)));

  return (
    cityDistricts.find(
      (district) => normalizeDistrictNameForCompare(district.name) === normalizedName
    ) ?? null
  );
}

async function findActiveApartmentDuplicate(districtId: string, row: ApartmentDuplicateLookup) {
  if (row.area === null || row.floor === null || row.price === null) {
    return null;
  }

  const [existing] = await db
    .select({ id: apartments.id })
    .from(apartments)
    .where(
      and(
        eq(apartments.districtId, districtId),
        eq(apartments.name, row.name),
        eq(apartments.area, row.area),
        eq(apartments.floor, row.floor),
        eq(apartments.price, row.price.toString()),
        eq(apartments.isActive, true)
      )
    )
    .limit(1);

  return existing ?? null;
}

async function getOrCreateCity(
  rawName: string,
  currentSession: Awaited<ReturnType<typeof assertRole>>
): Promise<{ city: City; created: boolean }> {
  const name = normalizeDirectoryName(rawName);
  if (!name) {
    throw new Error('Укажите город');
  }

  const existing = await findActiveCityByName(name);
  if (existing) {
    return { city: existing, created: false };
  }

  const insertData: NewCity = {
    name,
    description: 'Создано автоматически при импорте квартир из PDF',
    isActive: true,
  };
  let insertedNewCity = true;
  const [created] = await db
    .insert(cities)
    .values(insertData)
    .returning()
    .catch(async (error) => {
      const existingAfterRace = await findActiveCityByName(name);
      if (existingAfterRace) {
        insertedNewCity = false;
        return [existingAfterRace];
      }

      throw error;
    });
  if (!created) {
    throw new Error('Не удалось создать город');
  }

  if (insertedNewCity) {
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'city.created_from_pdf_import',
      entityType: 'city',
      entityId: created.id,
      entityLabel: created.name,
    });
  }

  return { city: created, created: insertedNewCity };
}

async function getOrCreateDistrict(
  cityId: string,
  rawName: string,
  currentSession: Awaited<ReturnType<typeof assertRole>>
): Promise<{ district: District; created: boolean }> {
  const name = normalizeDirectoryName(rawName);
  if (!name) {
    throw new Error('Укажите район');
  }

  const existing = await findActiveDistrictByName(cityId, name);
  if (existing) {
    return { district: existing, created: false };
  }

  const insertData: NewDistrict = {
    cityId,
    name,
    description: 'Создано автоматически при импорте квартир из PDF',
    photos: [],
    isActive: true,
  };
  let insertedNewDistrict = true;
  const [created] = await db
    .insert(districts)
    .values(insertData)
    .returning()
    .catch(async (error) => {
      const existingAfterRace = await findActiveDistrictByName(cityId, name);
      if (existingAfterRace) {
        insertedNewDistrict = false;
        return [existingAfterRace];
      }

      throw error;
    });
  if (!created) {
    throw new Error('Не удалось создать район');
  }

  if (insertedNewDistrict) {
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'district.created_from_pdf_import',
      entityType: 'district',
      entityId: created.id,
      entityLabel: created.name,
      details: { cityId },
    });
  }

  return { district: created, created: insertedNewDistrict };
}

function normalizeDirectoryName(value?: string) {
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function normalizeNameForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDistrictNameForCompare(value: string) {
  return normalizeNameForCompare(value)
    .replace(/\b(р н|рн|район)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPdfFile(formData: FormData) {
  const file = formData.get('pdfFile');
  if (!(file instanceof File)) {
    throw new Error('Загрузите PDF-файл');
  }

  return file;
}

function parseSelectedRowIds(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return null;
  }
}

async function attachCachedPdfImages(
  apartmentId: string,
  fileBuffer: Buffer,
  row: ApartmentPdfPreviewRow
): Promise<string | undefined> {
  if (!row.hasLayoutImage && !row.hasLocationImage) {
    return undefined;
  }

  try {
    const images = await extractApartmentPdfImagesForPageFromBuffer(fileBuffer, row.pageNumber);
    if (!images.layoutImage && !images.locationImage) {
      return 'Квартира создана, но изображения не найдены в PDF';
    }

    if (!images.layoutImage) {
      return 'Квартира создана, но планировка не найдена; геолокация не прикреплена без планировки';
    }

    const entityDir = await getEntityDir({
      entityType: 'apartments',
      entityId: apartmentId,
    });
    const photoPaths: string[] = [];
    photoPaths.push(await saveFileToEntityDir(
      entityDir,
      images.layoutImage,
      `layout-${row.sourceId || row.pageNumber}.jpg`
    ));
    if (images.locationImage) {
      photoPaths.push(await saveFileToEntityDir(
        entityDir,
        images.locationImage,
        `location-${row.sourceId || row.pageNumber}.jpg`
      ));
    }

    await db
      .update(apartments)
      .set({ photos: photoPaths, updatedAt: new Date() })
      .where(eq(apartments.id, apartmentId));

    return undefined;
  } catch (error) {
    console.warn('Failed to attach cached PDF images from PDF import:', error);
    return 'Квартира создана, но изображения из PDF не удалось сохранить';
  }
}

async function mapPreviewRowForClient(row: ApartmentPdfPreviewRow): Promise<ApartmentImportPreviewRow> {
  const cityName = normalizeDirectoryName(row.cityName) ?? '';
  const districtName = normalizeDirectoryName(row.districtName) ?? '';
  const city = cityName ? await findActiveCityByName(cityName) : null;
  const district = city && districtName ? await findActiveDistrictByName(city.id, districtName) : null;
  const locationIssues: ApartmentImportPreviewIssue[] = [];

  if (!cityName) {
    locationIssues.push({
      field: 'cityName',
      severity: 'error',
      message: 'Город не найден в PDF. Укажите его перед подтверждением.',
    });
  }
  if (!districtName) {
    locationIssues.push({
      field: 'districtName',
      severity: 'error',
      message: 'Район не найден в PDF. Укажите его перед подтверждением.',
    });
  }

  const issues = [
    ...row.errors.map((message) => ({
      field: inferPreviewIssueField(message),
      severity: 'error' as const,
      message,
    })),
    ...locationIssues,
    ...row.warnings.map((message) => ({
      field: inferPreviewIssueField(message),
      severity: 'warning' as const,
      message,
    })),
  ];

  return {
    id: row.rowId,
    rowNumber: row.pageNumber,
    sourcePage: row.pageNumber,
    sourceId: row.sourceId,
    status: mapClientStatus(row, issues),
    cityName,
    districtName,
    cityResolution: cityName ? (city ? 'existing' : 'create') : 'missing',
    districtResolution: districtName ? (district ? 'existing' : 'create') : 'missing',
    name: row.name,
    finishing: row.finishing,
    rooms: row.rooms,
    area: row.area,
    floor: row.floor,
    price: row.price,
    hasLayoutImage: row.hasLayoutImage,
    hasLocationImage: row.hasLocationImage,
    confidence: calculatePreviewConfidence(row),
    issues,
  };
}

function inferPreviewIssueField(message: string): ApartmentImportPreviewIssue['field'] {
  const normalized = message.toLowerCase();

  if (normalized.includes('город')) {
    return 'cityName';
  }
  if (normalized.includes('район')) {
    return 'districtName';
  }
  if (normalized.includes('назван')) {
    return 'name';
  }
  if (normalized.includes('комнат')) {
    return 'rooms';
  }
  if (normalized.includes('площад')) {
    return 'area';
  }
  if (normalized.includes('этаж')) {
    return 'floor';
  }
  if (normalized.includes('цен')) {
    return 'price';
  }
  if (normalized.includes('отделк')) {
    return 'finishing';
  }

  return undefined;
}

function isCorrectablePreviewIssue(message: string) {
  const field = inferPreviewIssueField(message);
  return !!field && CORRECTABLE_IMPORT_ISSUE_FIELDS.has(field);
}

function mapClientStatus(
  row: ApartmentPdfPreviewRow,
  issues: ApartmentImportPreviewIssue[]
): ApartmentImportRowStatus {
  if (row.status === 'duplicate') {
    return 'duplicate';
  }

  if (issues.some((issue) => issue.severity === 'error') || row.status === 'error') {
    return 'error';
  }

  if (issues.some((issue) => issue.severity === 'warning') || row.status === 'warning') {
    return 'warning';
  }

  return 'ready';
}

function calculatePreviewConfidence(row: ApartmentPdfPreviewRow): number {
  const checks = [
    row.cityName,
    row.districtName,
    row.name,
    row.rooms,
    row.area,
    row.floor,
    row.price,
    row.finishing,
  ];
  const found = checks.filter((value) => value !== null && value !== undefined && value !== '').length;

  return Number((found / checks.length).toFixed(2));
}

function buildClientSummary(rows: ApartmentImportPreviewRow[]): AnalyzeApartmentPdfImportResult['summary'] {
  return {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.status === 'ready').length,
    warningRows: rows.filter((row) => row.status === 'warning' || row.status === 'duplicate').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
  };
}

function getSafeImportCacheId(importId: string) {
  if (!/^[a-f0-9]{16}-[0-9a-f-]{36}$/i.test(importId)) {
    throw new Error('Некорректный идентификатор preview импорта');
  }

  return importId;
}

function getPdfImportCachePaths(importId: string) {
  const safeImportId = getSafeImportCacheId(importId);
  const basePath = path.join(PDF_IMPORT_CACHE_DIR, safeImportId);

  return {
    metadataPath: `${basePath}.json`,
    pdfPath: `${basePath}.pdf`,
  };
}

async function savePdfImportCache(importId: string, cachedImport: CachedPdfImport) {
  await mkdir(PDF_IMPORT_CACHE_DIR, { recursive: true });
  const { metadataPath, pdfPath } = getPdfImportCachePaths(importId);
  const { fileBuffer, ...metadata } = cachedImport;
  const metadataPayload: CachedPdfImportMetadata = {
    ...metadata,
    pdfFileName: path.basename(pdfPath),
  };

  await Promise.all([
    writeFile(pdfPath, fileBuffer),
    writeFile(metadataPath, JSON.stringify(metadataPayload), 'utf8'),
  ]);
}

async function readPdfImportCache(importId: string): Promise<CachedPdfImport | null> {
  const { metadataPath, pdfPath } = getPdfImportCachePaths(importId);

  try {
    const [metadataRaw, fileBuffer] = await Promise.all([
      readFile(metadataPath, 'utf8'),
      readFile(pdfPath),
    ]);
    const metadata = JSON.parse(metadataRaw) as CachedPdfImportMetadata;

    if (metadata.createdAt < Date.now() - CONFIRM_CACHE_TTL_MS) {
      await deletePdfImportCache(importId);
      return null;
    }

    return {
      ...metadata,
      fileBuffer,
    };
  } catch {
    return null;
  }
}

async function deletePdfImportCache(importId: string) {
  const { metadataPath, pdfPath } = getPdfImportCachePaths(importId);
  await Promise.all([
    rm(metadataPath, { force: true }),
    rm(pdfPath, { force: true }),
  ]);
}

async function prunePdfImportCache() {
  const expiresBefore = Date.now() - CONFIRM_CACHE_TTL_MS;

  let entries: string[];
  try {
    entries = await readdir(PDF_IMPORT_CACHE_DIR);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.json'))
      .map(async (entry) => {
        const importId = entry.replace(/\.json$/, '');
        try {
          const { metadataPath } = getPdfImportCachePaths(importId);
          const metadata = JSON.parse(
            await readFile(metadataPath, 'utf8')
          ) as CachedPdfImportMetadata;

          if (metadata.createdAt < expiresBefore) {
            await deletePdfImportCache(importId);
          }
        } catch {
          await deletePdfImportCache(importId);
        }
      })
  );
}

function emptyStringToUndefined(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getUserFacingError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
