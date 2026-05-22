import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function readProjectFile(...segments: string[]) {
  return readFileSync(path.resolve(process.cwd(), ...segments), 'utf8');
}

function readRepoFile(...segments: string[]) {
  return readFileSync(path.resolve(process.cwd(), '..', ...segments), 'utf8');
}

describe('PDF import contracts', () => {
  it('keeps confirm flow resilient to concurrent duplicate inserts and cleans preview cache', () => {
    const source = readProjectFile('lib', 'apartments', 'import-actions.ts');

    expect(source).toContain(
      "const APARTMENT_IMPORT_DEDUPE_CONSTRAINT = 'apartments_active_import_dedupe_idx'"
    );
    expect(source).toContain('isApartmentImportUniqueDuplicateError');
    expect(source).toContain('status: \'duplicate\'');
    expect(source).toContain('finally');
    expect(source).toContain('await deletePdfImportCache(normalizedInput.importId)');
  });

  it('keeps import history schema, migration, and indexes aligned', () => {
    const migration = readProjectFile('drizzle', '0010_apartment_import_history.sql');
    const schema = readProjectFile('lib', 'db', 'schema.ts');
    const journal = readProjectFile('drizzle', 'meta', '_journal.json');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "apartment_import_batches"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "apartment_import_rows"');
    expect(migration).toContain('ON DELETE cascade');
    expect(migration).toContain('"apartment_import_batches_file_hash_idx"');
    expect(migration).toContain('"apartment_import_rows_batch_idx"');

    expect(schema).toContain("export const apartmentImportBatches = pgTable");
    expect(schema).toContain("export const apartmentImportRows = pgTable");
    expect(schema).toContain("apartmentImportRowsBatchIdx");
    expect(schema).toContain("apartmentImportBatchesFileHashIdx");

    expect(journal).toContain('"tag": "0010_apartment_import_history"');
  });

  it('keeps import rollback schema, migration, and cleanup ordering aligned', () => {
    const migration = readProjectFile('drizzle', '0011_import_history_rollback.sql');
    const schema = readProjectFile('lib', 'db', 'schema.ts');
    const history = readProjectFile('lib', 'apartments', 'import-history.ts');
    const journal = readProjectFile('drizzle', 'meta', '_journal.json');

    expect(migration).toContain('"rollback_status" varchar(32)');
    expect(migration).toContain('"rolled_back_at" timestamp with time zone');
    expect(migration).toContain('"apartment_import_batches_rollback_status_idx"');

    expect(schema).toContain('rollbackStatus: varchar');
    expect(schema).toContain('rolledBackByUserId');
    expect(schema).toContain('apartmentImportBatchesRollbackStatusIdx');

    expect(history.indexOf('await db.transaction')).toBeLessThan(
      history.indexOf('await deleteRollbackApartmentFiles')
    );
    expect(history).toContain('cleanupRollbackDirectories');
    expect(history).toContain("reason: 'has_apartments'");
    expect(history).toContain("reason: 'has_districts'");
    expect(history).toContain('Promise.allSettled');
    expect(journal).toContain('"tag": "0011_import_history_rollback"');
  });

  it('keeps CI checks broad without running Docker build in GitHub Actions', () => {
    const ci = readRepoFile('.github', 'workflows', 'ci.yml');

    expect(ci).toContain('npm run lint');
    expect(ci).toContain('npm run typecheck');
    expect(ci).toContain('npm test');
    expect(ci).toContain('npm run build');
    expect(ci).toContain('dotnet test ApartmentBot.slnx');
    expect(ci).not.toMatch(/\bdocker\s+(compose\s+)?build\b/i);
    expect(ci).not.toMatch(/\bdocker\s+compose\s+up\s+--build\b/i);
  });

  it('keeps import client guarded by manual confirmation and progress states', () => {
    const client = readProjectFile(
      'app',
      'dashboard',
      'apartments',
      'import',
      'apartment-pdf-import-client.tsx'
    );

    expect(client).toContain('function openImportConfirmation()');
    expect(client).toContain('<Dialog open={isConfirmDialogOpen}');
    expect(client).toContain('expectedCreatedRows');
    expect(client).toContain('enabledDuplicateRows');
    expect(client).toContain('disabled={isImporting}');
    expect(client).toContain('<Loader2 className="h-4 w-4 animate-spin" />');
    expect(client).toContain(
      "setDraftRows(result.rows.map((row) => ({ ...row, enabled: row.status !== 'duplicate' })))"
    );
    expect(client).toContain('function setVisibleRowsSelection');
    expect(client).toContain('function toggleRowSelection');
    expect(client).toContain('function applyLocationToSelectedRows');
    expect(client).toContain('<option value="">Не менять город</option>');
    expect(client).toContain('Галочка «Выбран» выбирает строки');
    expect(client).toContain('const rowsForImport = enabledRows.map');
    expect(client).toContain('row.hasLocationImage');
  });

  it('keeps PDF import location image extraction wired into preview and saved photos', () => {
    const parser = readProjectFile('lib', 'apartments', 'pdf-import.ts');
    const actions = readProjectFile('lib', 'apartments', 'import-actions.ts');
    const batchAnalyzer = readProjectFile('scripts', 'analyze-pdf-batch.ts');

    expect(parser).toContain('hasLocationImage: boolean');
    expect(parser).toContain('withLocationImages');
    expect(parser).toContain('extractApartmentPdfImagesForPageFromBuffer');
    expect(parser).toContain('extractLocationImageForApartmentPage');
    expect(actions).toContain('attachCachedPdfImages');
    expect(actions).toContain('location-');
    expect(actions).toContain('hasLocationImage: row.hasLocationImage');
    expect(batchAnalyzer).toContain('withLocationImages');
  });

  it('keeps destructive PDF import integration checks opt-in with explicit cleanup', () => {
    const e2e = readProjectFile('tests', 'pdf-import-confirm-flow.integration.test.ts');

    expect(e2e).toContain("RUN_PDF_IMPORT_CONFIRM_E2E === 'true'");
    expect(e2e).toContain('const describeIntegration = RUN_INTEGRATION ? describe : describe.skip');
    expect(e2e).toContain('afterEach(async () =>');
    expect(e2e).toContain('await cleanupIntegrationData(context)');
    expect(e2e).toContain('await cleanupApartmentFiles(apartment.id, apartment.photos ?? [])');
    expect(e2e).toContain('await context.db.delete(apartmentImportRows)');
    expect(e2e).toContain('await context.db.delete(apartmentImportBatches)');
    expect(e2e).toContain("'.apartment-import-cache'");
  });
});
