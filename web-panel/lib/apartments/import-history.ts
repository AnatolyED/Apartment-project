import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/audit/actions';
import { assertRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  apartments,
  apartmentImportBatches,
  apartmentImportRows,
  cities,
  districts,
  type ApartmentImportMode,
  type ApartmentImportRow,
  type NewApartmentImportBatch,
  type NewApartmentImportRow,
  type UserRole,
} from '@/lib/db/schema';
import { deleteFile } from '@/lib/storage';
import {
  buildApartmentImportRollbackSummary,
  buildApartmentImportHistorySummary,
  isApartmentImportRollbackComplete,
  type ApartmentImportRollbackSummary,
  type ApartmentImportRowRollbackStatus,
  type ApartmentImportHistoryRowStatus,
  type ApartmentImportHistoryStatus,
} from '@/lib/apartments/import-history-utils';

const listImportHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const importHistoryDetailsSchema = z.object({
  id: z.string().uuid(),
});

const rollbackImportBatchSchema = z.object({
  id: z.string().uuid(),
});

export interface ApartmentImportHistoryActor {
  userId: string;
  login: string;
  role: UserRole;
}

export interface RecordApartmentImportHistoryRowInput {
  sourceRowId: string;
  rowNumber?: number;
  sourcePage?: number;
  sourceId?: string;
  apartmentId?: string;
  name: string;
  cityName?: string;
  districtName?: string;
  status: ApartmentImportHistoryRowStatus;
  message?: string;
  warnings?: string[];
  errors?: string[];
  details?: Record<string, unknown>;
}

export interface RecordApartmentImportHistoryInput {
  actor: ApartmentImportHistoryActor;
  fileName: string;
  fileHash?: string | null;
  mode: ApartmentImportMode;
  parserProvider: string;
  totalRows: number;
  submittedRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  previewWarningRows?: number;
  rowWarnings?: number;
  createdCities: string[];
  createdDistricts: string[];
  details?: Record<string, unknown>;
  rows: RecordApartmentImportHistoryRowInput[];
}

export async function recordApartmentImportHistory(
  input: RecordApartmentImportHistoryInput
): Promise<string> {
  const summary = buildApartmentImportHistorySummary({
    totalRows: input.totalRows,
    submittedRows: input.submittedRows,
    importedRows: input.importedRows,
    duplicateRows: input.duplicateRows,
    errorRows: input.errorRows,
    previewWarningRows: input.previewWarningRows,
    rowWarnings: input.rowWarnings,
  });

  const batchData: NewApartmentImportBatch = {
    actorUserId: input.actor.userId,
    actorLogin: input.actor.login,
    actorRole: input.actor.role,
    fileName: input.fileName,
    fileHash: input.fileHash ?? null,
    mode: input.mode,
    parserProvider: input.parserProvider,
    status: summary.status,
    totalRows: input.totalRows,
    submittedRows: input.submittedRows,
    importedRows: input.importedRows,
    duplicateRows: input.duplicateRows,
    errorRows: input.errorRows,
    warningRows: summary.warningRows,
    createdCities: input.createdCities,
    createdDistricts: input.createdDistricts,
    summary,
    details: input.details,
  };

  const [createdBatch] = await db.insert(apartmentImportBatches).values(batchData).returning({
    id: apartmentImportBatches.id,
  });

  if (!createdBatch) {
    throw new Error('Failed to record apartment import history');
  }

  const rowData: NewApartmentImportRow[] = input.rows.map((row) => ({
    batchId: createdBatch.id,
    sourceRowId: row.sourceRowId,
    rowNumber: row.rowNumber,
    sourcePage: row.sourcePage,
    sourceId: row.sourceId,
    apartmentId: row.apartmentId,
    name: row.name,
    cityName: row.cityName,
    districtName: row.districtName,
    status: row.status,
    message: row.message,
    warnings: row.warnings ?? [],
    errors: row.errors ?? [],
    details: row.details,
  }));

  if (rowData.length > 0) {
    await db.insert(apartmentImportRows).values(rowData);
  }

  return createdBatch.id;
}

export async function listApartmentImportHistoryAction(
  input: z.input<typeof listImportHistorySchema> = {}
) {
  'use server';

  await assertRole(['admin', 'moderator']);
  const { limit } = listImportHistorySchema.parse(input);

  const imports = await db
    .select({
      id: apartmentImportBatches.id,
      actorLogin: apartmentImportBatches.actorLogin,
      actorRole: apartmentImportBatches.actorRole,
      fileName: apartmentImportBatches.fileName,
      fileHash: apartmentImportBatches.fileHash,
      mode: apartmentImportBatches.mode,
      parserProvider: apartmentImportBatches.parserProvider,
      status: apartmentImportBatches.status,
      totalRows: apartmentImportBatches.totalRows,
      submittedRows: apartmentImportBatches.submittedRows,
      importedRows: apartmentImportBatches.importedRows,
      duplicateRows: apartmentImportBatches.duplicateRows,
      errorRows: apartmentImportBatches.errorRows,
      warningRows: apartmentImportBatches.warningRows,
      createdCities: apartmentImportBatches.createdCities,
      createdDistricts: apartmentImportBatches.createdDistricts,
      rollbackStatus: apartmentImportBatches.rollbackStatus,
      rolledBackAt: apartmentImportBatches.rolledBackAt,
      rolledBackByLogin: apartmentImportBatches.rolledBackByLogin,
      rollbackDetails: apartmentImportBatches.rollbackDetails,
      summary: apartmentImportBatches.summary,
      createdAt: apartmentImportBatches.createdAt,
    })
    .from(apartmentImportBatches)
    .orderBy(desc(apartmentImportBatches.createdAt))
    .limit(limit);

  return {
    success: true,
    imports,
  };
}

export async function getApartmentImportHistoryAction(
  input: z.input<typeof importHistoryDetailsSchema>
) {
  'use server';

  await assertRole(['admin', 'moderator']);
  const { id } = importHistoryDetailsSchema.parse(input);

  const [importBatch] = await db
    .select()
    .from(apartmentImportBatches)
    .where(eq(apartmentImportBatches.id, id))
    .limit(1);

  if (!importBatch) {
    return {
      success: false,
      error: 'Import history not found',
    };
  }

  const rows = await db
    .select()
    .from(apartmentImportRows)
    .where(eq(apartmentImportRows.batchId, id))
    .orderBy(asc(apartmentImportRows.rowNumber), asc(apartmentImportRows.createdAt));

  return {
    success: true,
    import: importBatch,
    rows,
  };
}

export async function rollbackApartmentImportBatchAction(
  input: z.input<typeof rollbackImportBatchSchema>
) {
  'use server';

  const currentSession = await assertRole(['admin', 'moderator']);
  const { id } = rollbackImportBatchSchema.parse(input);

  const [importBatch] = await db
    .select()
    .from(apartmentImportBatches)
    .where(eq(apartmentImportBatches.id, id))
    .limit(1);

  if (!importBatch) {
    return {
      success: false,
      error: 'Import history not found',
    };
  }

  if (isApartmentImportRollbackComplete(importBatch.rollbackStatus)) {
    return {
      success: true,
      alreadyRolledBack: true,
      batchId: importBatch.id,
      summary: parseRollbackSummary(importBatch.rollbackDetails),
    };
  }

  try {
    const rows = await db
      .select()
      .from(apartmentImportRows)
      .where(eq(apartmentImportRows.batchId, id))
      .orderBy(asc(apartmentImportRows.rowNumber), asc(apartmentImportRows.createdAt));

    const rollbackPlan = await buildRollbackPlan(rows);

    const summary = buildApartmentImportRollbackSummary({
      rolledBackRows: rollbackPlan.rolledBackRows.length,
      alreadyMissingRows: rollbackPlan.alreadyMissingRows.length,
      skippedRows: rollbackPlan.skippedRows.length,
      failedRows: 0,
    });
    const rolledBackAt = new Date();
    const rollbackDetailsBase = {
      ...summary,
      apartmentIds: rollbackPlan.apartmentsToDelete.map((apartment) => apartment.id),
      rolledBackByUserId: currentSession.userId,
      rolledBackByLogin: currentSession.login,
    };
    let rollbackDetails: Record<string, unknown> = rollbackDetailsBase;

    await db.transaction(async (tx) => {
      if (rollbackPlan.apartmentsToDelete.length > 0) {
        await tx
          .delete(apartments)
          .where(
            inArray(
              apartments.id,
              rollbackPlan.apartmentsToDelete.map((apartment) => apartment.id)
            )
          );
      }

      for (const rowUpdate of rollbackPlan.rowUpdates) {
        await tx
          .update(apartmentImportRows)
          .set({
            rollbackStatus: rowUpdate.rollbackStatus,
            rolledBackAt,
            rollbackMessage: rowUpdate.rollbackMessage,
          })
          .where(eq(apartmentImportRows.id, rowUpdate.rowId));
      }

      const directoryCleanup = await cleanupRollbackDirectories(
        tx,
        importBatch.createdCities ?? [],
        importBatch.createdDistricts ?? []
      );
      rollbackDetails = {
        ...rollbackDetailsBase,
        directoryCleanup,
      };

      await tx
        .update(apartmentImportBatches)
        .set({
          rollbackStatus: summary.status,
          rolledBackAt,
          rolledBackByUserId: currentSession.userId,
          rolledBackByLogin: currentSession.login,
          rollbackDetails,
        })
        .where(eq(apartmentImportBatches.id, id));
    });

    await deleteRollbackApartmentFiles(rollbackPlan.apartmentsToDelete);

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'apartments.pdf_import.rollback',
      entityType: 'apartment_import',
      entityId: importBatch.id,
      entityLabel: importBatch.fileName,
      details: rollbackDetails,
    });

    revalidatePath('/dashboard/apartments');
    revalidatePath('/dashboard/apartments/import/history');
    revalidatePath('/dashboard/cities');
    revalidatePath('/dashboard/districts');

    return {
      success: true,
      alreadyRolledBack: false,
      batchId: importBatch.id,
      summary,
    };
  } catch (error) {
    const summary = buildApartmentImportRollbackSummary({
      rolledBackRows: 0,
      alreadyMissingRows: 0,
      skippedRows: 0,
      failedRows: Math.max(importBatch.importedRows, 1),
    });
    const rollbackDetails = {
      ...summary,
      error: getUserFacingError(error, 'Rollback failed'),
      rolledBackByUserId: currentSession.userId,
      rolledBackByLogin: currentSession.login,
    };

    await markRollbackFailed(importBatch.id, currentSession, rollbackDetails);

    return {
      success: false,
      error: getUserFacingError(error, 'Rollback failed'),
      batchId: importBatch.id,
      summary,
    };
  }
}

interface RollbackRowUpdate {
  rowId: string;
  rollbackStatus: ApartmentImportRowRollbackStatus;
  rollbackMessage: string;
}

interface RollbackDirectoryCleanup {
  deletedCities: string[];
  deletedDistricts: string[];
  skippedCities: Array<{ name: string; reason: string }>;
  skippedDistricts: Array<{ name: string; reason: string }>;
}

type RollbackTransaction = Pick<typeof db, 'delete' | 'select'>;

async function buildRollbackPlan(rows: ApartmentImportRow[]) {
  const createdRows = rows.filter((row) => row.status === 'created');
  const apartmentIds = createdRows
    .map((row) => row.apartmentId)
    .filter((id): id is string => Boolean(id));
  const existingApartments =
    apartmentIds.length > 0
      ? await db.select().from(apartments).where(inArray(apartments.id, apartmentIds))
      : [];
  const apartmentsById = new Map(existingApartments.map((apartment) => [apartment.id, apartment]));
  const rolledBackRows: ApartmentImportRow[] = [];
  const alreadyMissingRows: ApartmentImportRow[] = [];
  const skippedRows = rows.filter((row) => row.status !== 'created');
  const rowUpdates: RollbackRowUpdate[] = [];

  for (const row of createdRows) {
    if (row.apartmentId && apartmentsById.has(row.apartmentId)) {
      rolledBackRows.push(row);
      rowUpdates.push({
        rowId: row.id,
        rollbackStatus: 'rolled_back',
        rollbackMessage: 'Apartment deleted by import rollback',
      });
      continue;
    }

    alreadyMissingRows.push(row);
    rowUpdates.push({
      rowId: row.id,
      rollbackStatus: 'already_missing',
      rollbackMessage: 'Apartment was already missing before rollback',
    });
  }

  for (const row of skippedRows) {
    rowUpdates.push({
      rowId: row.id,
      rollbackStatus: 'skipped',
      rollbackMessage: 'Row did not create an apartment',
    });
  }

  return {
    rolledBackRows,
    alreadyMissingRows,
    skippedRows,
    rowUpdates,
    apartmentsToDelete: existingApartments,
  };
}

async function cleanupRollbackDirectories(
  tx: RollbackTransaction,
  createdCityNames: string[],
  createdDistrictNames: string[]
): Promise<RollbackDirectoryCleanup> {
  const cleanup: RollbackDirectoryCleanup = {
    deletedCities: [],
    deletedDistricts: [],
    skippedCities: [],
    skippedDistricts: [],
  };

  for (const districtName of Array.from(new Set(createdDistrictNames))) {
    const parsed = parseCreatedDistrictName(districtName);
    if (!parsed) {
      cleanup.skippedDistricts.push({ name: districtName, reason: 'unrecognized_name' });
      continue;
    }

    const [existingDistrict] = await tx
      .select({
        id: districts.id,
        cityId: districts.cityId,
        name: districts.name,
      })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .where(and(eq(cities.name, parsed.cityName), eq(districts.name, parsed.districtName)))
      .limit(1);

    if (!existingDistrict) {
      cleanup.skippedDistricts.push({ name: districtName, reason: 'not_found' });
      continue;
    }

    const districtApartments = await tx
      .select({ id: apartments.id })
      .from(apartments)
      .where(eq(apartments.districtId, existingDistrict.id))
      .limit(1);

    if (districtApartments.length > 0) {
      cleanup.skippedDistricts.push({ name: districtName, reason: 'has_apartments' });
      continue;
    }

    await tx.delete(districts).where(eq(districts.id, existingDistrict.id));
    cleanup.deletedDistricts.push(districtName);
  }

  for (const cityName of Array.from(new Set(createdCityNames))) {
    const [existingCity] = await tx
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .where(eq(cities.name, cityName))
      .limit(1);

    if (!existingCity) {
      cleanup.skippedCities.push({ name: cityName, reason: 'not_found' });
      continue;
    }

    const cityDistricts = await tx
      .select({ id: districts.id })
      .from(districts)
      .where(eq(districts.cityId, existingCity.id))
      .limit(1);

    if (cityDistricts.length > 0) {
      cleanup.skippedCities.push({ name: cityName, reason: 'has_districts' });
      continue;
    }

    await tx.delete(cities).where(eq(cities.id, existingCity.id));
    cleanup.deletedCities.push(cityName);
  }

  return cleanup;
}

function parseCreatedDistrictName(value: string) {
  const separator = ' / ';
  const separatorIndex = value.indexOf(separator);
  if (separatorIndex === -1) {
    return null;
  }

  const cityName = value.slice(0, separatorIndex).trim();
  const districtName = value.slice(separatorIndex + separator.length).trim();
  if (!cityName || !districtName) {
    return null;
  }

  return { cityName, districtName };
}

async function deleteRollbackApartmentFiles(
  apartmentsToDelete: Array<{ photos: string[] | null }>
) {
  const results = await Promise.allSettled(
    apartmentsToDelete.flatMap((apartment) =>
      (apartment.photos ?? []).map((photo) => deleteFile(photo))
    )
  );

  const failedResults = results.filter((result) => result.status === 'rejected');
  if (failedResults.length > 0) {
    console.warn('Failed to delete some rollback apartment files:', failedResults);
  }
}

async function markRollbackFailed(
  batchId: string,
  currentSession: Awaited<ReturnType<typeof assertRole>>,
  rollbackDetails: Record<string, unknown>
) {
  try {
    await db
      .update(apartmentImportBatches)
      .set({
        rollbackStatus: 'failed',
        rolledBackAt: new Date(),
        rolledBackByUserId: currentSession.userId,
        rolledBackByLogin: currentSession.login,
        rollbackDetails,
      })
      .where(eq(apartmentImportBatches.id, batchId));

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'apartments.pdf_import.rollback_failed',
      entityType: 'apartment_import',
      entityId: batchId,
      details: rollbackDetails,
    });
  } catch (error) {
    console.warn('Failed to mark apartment import rollback as failed:', error);
  }
}

function parseRollbackSummary(value: unknown): ApartmentImportRollbackSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const summary = value as Partial<ApartmentImportRollbackSummary>;
  if (
    typeof summary.rolledBackRows !== 'number' ||
    typeof summary.alreadyMissingRows !== 'number' ||
    typeof summary.skippedRows !== 'number' ||
    typeof summary.failedRows !== 'number' ||
    !summary.status
  ) {
    return null;
  }

  return {
    rolledBackRows: summary.rolledBackRows,
    alreadyMissingRows: summary.alreadyMissingRows,
    skippedRows: summary.skippedRows,
    failedRows: summary.failedRows,
    status: summary.status,
  };
}

function getUserFacingError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type ApartmentImportHistoryListItem = Awaited<
  ReturnType<typeof listApartmentImportHistoryAction>
>['imports'][number];

export type ApartmentImportHistoryDetails = Extract<
  Awaited<ReturnType<typeof getApartmentImportHistoryAction>>,
  { success: true }
>;

export type { ApartmentImportHistoryStatus };
export type {
  ApartmentImportRollbackStatus,
  ApartmentImportRowRollbackStatus,
} from '@/lib/apartments/import-history-utils';
