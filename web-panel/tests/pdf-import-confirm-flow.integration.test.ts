import { createHash, randomUUID } from 'crypto';
import { access, readFile, rm } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { File as NodeFile } from 'buffer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

const WEB_PANEL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.cwd() !== WEB_PANEL_ROOT) {
  process.chdir(WEB_PANEL_ROOT);
}

loadDotEnv(path.join(WEB_PANEL_ROOT, '.env'));

let currentSessionToken: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'panel_session' && currentSessionToken
        ? { name, value: currentSessionToken }
        : undefined,
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const RUN_INTEGRATION = process.env.RUN_PDF_IMPORT_CONFIRM_E2E === 'true';
const SAMPLE_PDF_PATH =
  process.env.PDF_IMPORT_E2E_SAMPLE ?? 'C:\\Users\\TOLRH\\Downloads\\Квартиры.pdf';
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

interface TestContext {
  db: Awaited<typeof import('@/lib/db')>['db'];
  schema: typeof import('@/lib/db/schema');
  userId?: string;
  cityName?: string;
  districtName?: string;
  importId?: string;
  createdApartmentIds: string[];
  createdBatchIds: string[];
}

const context: TestContext = {
  db: undefined as unknown as TestContext['db'],
  schema: undefined as unknown as TestContext['schema'],
  createdApartmentIds: [],
  createdBatchIds: [],
};

beforeAll(async () => {
  if (!RUN_INTEGRATION) {
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for RUN_PDF_IMPORT_CONFIRM_E2E=true');
  }

  if (!existsSync(SAMPLE_PDF_PATH)) {
    throw new Error(`Sample PDF not found: ${SAMPLE_PDF_PATH}`);
  }

  const [{ db }, schema] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/db/schema'),
  ]);
  context.db = db;
  context.schema = schema;
});

afterEach(async () => {
  if (!RUN_INTEGRATION || !context.db || !context.schema) {
    return;
  }

  await cleanupIntegrationData(context);
  currentSessionToken = undefined;
});

describeIntegration('PDF import confirm flow integration', () => {
  it(
    'analyzes a real PDF, confirms one apartment, records history, stores layout when available, and cleans up',
    async () => {
      const runId = randomUUID().slice(0, 8);
      const cityName = `E2E PDF City ${runId}`;
      const districtName = `E2E PDF District ${runId}`;
      context.cityName = cityName;
      context.districtName = districtName;

      const { user } = await createAuthenticatedTestUser(context, runId);
      context.userId = user.id;

      const {
        analyzeApartmentPdfImportAction,
        confirmApartmentPdfImportAction,
      } = await import('@/lib/apartments/import-actions');
      const {
        getApartmentImportHistoryAction,
        listApartmentImportHistoryAction,
      } = await import('@/lib/apartments/import-history');

      const pdfBuffer = await readFile(SAMPLE_PDF_PATH);
      const pdfFile = new NodeFile([pdfBuffer], path.basename(SAMPLE_PDF_PATH), {
        type: 'application/pdf',
      }) as unknown as File;

      const formData = new FormData();
      formData.set('pdfFile', pdfFile);
      formData.set('cityName', cityName);
      formData.set('districtName', districtName);
      formData.set('mode', 'rules');

      const analyzeResult = await analyzeApartmentPdfImportAction(formData);

      expect(analyzeResult.success).toBe(true);
      expect(analyzeResult.importId).toBeTruthy();
      expect(analyzeResult.rows?.length).toBeGreaterThan(0);
      context.importId = analyzeResult.importId;

      const selectedRow = [...(analyzeResult.rows ?? [])]
        .filter(
          (row) =>
            row.name &&
            row.finishing &&
            row.rooms &&
            row.area !== null &&
            row.floor !== null &&
            row.price !== null
        )
        .sort(
          (left, right) =>
            Number(right.hasLayoutImage && right.hasLocationImage) -
              Number(left.hasLayoutImage && left.hasLocationImage) ||
            Number(right.hasLayoutImage) - Number(left.hasLayoutImage)
        )[0];

      expect(selectedRow).toBeTruthy();

      const confirmResult = await confirmApartmentPdfImportAction({
        importId: analyzeResult.importId!,
        mode: 'rules',
        rows: [
          {
            rowId: selectedRow.id,
            enabled: true,
            cityName,
            districtName,
            name: selectedRow.name,
            finishing: selectedRow.finishing!,
            rooms: selectedRow.rooms,
            area: selectedRow.area!,
            floor: selectedRow.floor!,
            price: selectedRow.price!,
          },
        ],
      });

      expect(confirmResult.success).toBe(true);
      expect(confirmResult.importedCount).toBe(1);
      expect(confirmResult.skippedDuplicates).toBe(0);
      expect(confirmResult.failedCount).toBe(0);

      const createdRow = confirmResult.rows?.find((row) => row.status === 'created');
      expect(createdRow?.apartmentId).toBeTruthy();
      context.createdApartmentIds.push(createdRow!.apartmentId!);

      await expectImportCacheDeleted(analyzeResult.importId!);

      const [createdApartment] = await context.db
        .select()
        .from(context.schema.apartments)
        .where(eq(context.schema.apartments.id, createdRow!.apartmentId!))
        .limit(1);

      expect(createdApartment).toBeTruthy();
      expect(createdApartment.name).toBe(selectedRow.name);

      if (selectedRow.hasLayoutImage) {
        expect(createdRow?.message).toBeUndefined();
        expect(createdApartment.photos?.length).toBeGreaterThanOrEqual(
          selectedRow.hasLocationImage ? 2 : 1
        );
        await expectStoredPhotosExist(createdApartment.photos ?? []);
      }

      const [batch] = await context.db
        .select()
        .from(context.schema.apartmentImportBatches)
        .where(eq(context.schema.apartmentImportBatches.actorUserId, user.id))
        .limit(1);

      expect(batch).toBeTruthy();
      context.createdBatchIds.push(batch.id);
      expect(batch.fileName).toBe(path.basename(SAMPLE_PDF_PATH));
      expect(batch.fileHash).toMatch(/^[a-f0-9]{64}$/);
      expect(analyzeResult.importId?.startsWith(batch.fileHash!.slice(0, 16))).toBe(true);
      expect(batch.mode).toBe('rules');
      expect(batch.totalRows).toBeGreaterThan(0);
      expect(batch.submittedRows).toBe(1);
      expect(batch.importedRows).toBe(1);
      expect(batch.duplicateRows).toBe(0);
      expect(batch.errorRows).toBe(0);
      expect(batch.createdCities).toContain(cityName);
      expect(batch.createdDistricts).toContain(`${cityName} / ${districtName}`);

      const historyList = await listApartmentImportHistoryAction({ limit: 100 });
      expect(historyList.success).toBe(true);
      expect(historyList.imports.some((item) => item.id === batch.id)).toBe(true);

      const historyDetails = await getApartmentImportHistoryAction({ id: batch.id });
      expect(historyDetails.success).toBe(true);
      const historyRows = ('rows' in historyDetails ? historyDetails.rows : []) ?? [];
      expect(historyRows).toHaveLength(1);
      expect(historyRows[0]?.apartmentId).toBe(createdRow!.apartmentId);
      expect(historyRows[0]?.status).toBe('created');
    },
    120_000
  );
});

function loadDotEnv(envPath: string) {
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

async function createAuthenticatedTestUser(context: TestContext, runId: string) {
  const token = `pdf-import-e2e-${runId}-${randomUUID()}`;
  currentSessionToken = token;

  const [user] = await context.db
    .insert(context.schema.users)
    .values({
      login: `pdf-import-e2e-${runId}`,
      passwordHash: 'integration-test-not-used',
      role: 'admin',
      isActive: true,
      isBlocked: false,
      mustChangePassword: false,
      isProtected: false,
    })
    .returning();

  await context.db.insert(context.schema.userSessions).values({
    userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return { user };
}

async function expectImportCacheDeleted(importId: string) {
  const cacheBasePath = path.join(WEB_PANEL_ROOT, '.apartment-import-cache', importId);

  await expect(access(`${cacheBasePath}.json`)).rejects.toThrow();
  await expect(access(`${cacheBasePath}.pdf`)).rejects.toThrow();
}

async function expectStoredPhotosExist(photos: string[]) {
  for (const photo of photos) {
    const fullPath = path.resolve(WEB_PANEL_ROOT, 'public', photo.replace(/^\/+/, ''));
    await expect(access(fullPath)).resolves.toBeUndefined();
  }
}

async function cleanupIntegrationData(context: TestContext) {
  const {
    apartmentImportBatches,
    apartmentImportRows,
    apartments,
    auditLogs,
    cities,
    districts,
    userSessions,
    users,
  } = context.schema;

  const batchIds = new Set(context.createdBatchIds);
  if (context.userId) {
    const userBatches = await context.db
      .select({ id: apartmentImportBatches.id })
      .from(apartmentImportBatches)
      .where(eq(apartmentImportBatches.actorUserId, context.userId));
    userBatches.forEach((batch) => batchIds.add(batch.id));
  }

  if (batchIds.size > 0) {
    const ids = [...batchIds];
    await context.db.delete(apartmentImportRows).where(inArray(apartmentImportRows.batchId, ids));
    await context.db.delete(apartmentImportBatches).where(inArray(apartmentImportBatches.id, ids));
  }

  const districtIds = new Set<string>();
  if (context.cityName && context.districtName) {
    const createdDistricts = await context.db
      .select({ id: districts.id })
      .from(districts)
      .innerJoin(cities, eq(cities.id, districts.cityId))
      .where(and(eq(cities.name, context.cityName), eq(districts.name, context.districtName)));

    createdDistricts.forEach((district) => districtIds.add(district.id));
  }

  if (districtIds.size > 0) {
    const createdApartments = await context.db
      .select({ id: apartments.id, photos: apartments.photos })
      .from(apartments)
      .where(inArray(apartments.districtId, [...districtIds]));

    for (const apartment of createdApartments) {
      context.createdApartmentIds.push(apartment.id);
      await cleanupApartmentFiles(apartment.id, apartment.photos ?? []);
    }

    await context.db.delete(apartments).where(inArray(apartments.districtId, [...districtIds]));
    await context.db.delete(districts).where(inArray(districts.id, [...districtIds]));
  }

  if (context.cityName) {
    await context.db.delete(cities).where(eq(cities.name, context.cityName));
  }

  if (context.userId) {
    await context.db.delete(auditLogs).where(eq(auditLogs.actorUserId, context.userId));
    await context.db.delete(userSessions).where(eq(userSessions.userId, context.userId));
    await context.db.delete(users).where(eq(users.id, context.userId));
  }

  if (context.importId) {
    await rm(path.join(WEB_PANEL_ROOT, '.apartment-import-cache', `${context.importId}.json`), {
      force: true,
    });
    await rm(path.join(WEB_PANEL_ROOT, '.apartment-import-cache', `${context.importId}.pdf`), {
      force: true,
    });
  }

  context.userId = undefined;
  context.cityName = undefined;
  context.districtName = undefined;
  context.importId = undefined;
  context.createdApartmentIds = [];
  context.createdBatchIds = [];
}

async function cleanupApartmentFiles(apartmentId: string, photos: string[]) {
  for (const photo of photos) {
    const fullPath = path.resolve(WEB_PANEL_ROOT, 'public', photo.replace(/^\/+/, ''));
    await rm(fullPath, { force: true });
    await rm(getTelegramReadyPath(fullPath), { force: true });
  }

  await rm(path.join(WEB_PANEL_ROOT, 'public', 'uploads', 'apartments', apartmentId), {
    force: true,
    recursive: true,
  });
}

function getTelegramReadyPath(filePath: string) {
  const extensionIndex = filePath.lastIndexOf('.');
  return extensionIndex > 0
    ? `${filePath.slice(0, extensionIndex)}-telegram.jpg`
    : `${filePath}-telegram.jpg`;
}
