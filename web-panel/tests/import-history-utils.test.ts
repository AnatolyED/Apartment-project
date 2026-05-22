import { describe, expect, it } from 'vitest';
import {
  buildApartmentImportRollbackSummary,
  buildApartmentImportHistorySummary,
  isApartmentImportRollbackComplete,
  resolveApartmentImportRollbackStatus,
  resolveApartmentImportHistoryStatus,
} from '@/lib/apartments/import-history-utils';

describe('import history summary', () => {
  it('marks a clean import as completed', () => {
    const summary = buildApartmentImportHistorySummary({
      totalRows: 3,
      submittedRows: 3,
      importedRows: 3,
      duplicateRows: 0,
      errorRows: 0,
      previewWarningRows: 0,
      rowWarnings: 0,
    });

    expect(summary.status).toBe('completed');
    expect(summary.warningRows).toBe(0);
  });

  it('marks mixed created and failed rows as partial', () => {
    expect(
      resolveApartmentImportHistoryStatus({
        importedRows: 2,
        duplicateRows: 0,
        errorRows: 1,
      })
    ).toBe('partial');
  });

  it('keeps the highest warning count from preview and imported rows', () => {
    const summary = buildApartmentImportHistorySummary({
      totalRows: 4,
      submittedRows: 4,
      importedRows: 3,
      duplicateRows: 1,
      errorRows: 0,
      previewWarningRows: 2,
      rowWarnings: 1,
    });

    expect(summary.warningRows).toBe(2);
    expect(summary.status).toBe('completed');
  });
});

describe('import rollback summary', () => {
  it('marks a rollback with deleted and missing apartments as completed', () => {
    const summary = buildApartmentImportRollbackSummary({
      rolledBackRows: 2,
      alreadyMissingRows: 1,
      skippedRows: 3,
      failedRows: 0,
    });

    expect(summary.status).toBe('completed');
    expect(summary.rolledBackRows).toBe(2);
    expect(summary.alreadyMissingRows).toBe(1);
  });

  it('marks rollback failures as partial when some rows were already handled', () => {
    expect(
      resolveApartmentImportRollbackStatus({
        rolledBackRows: 1,
        alreadyMissingRows: 0,
        skippedRows: 0,
        failedRows: 1,
      })
    ).toBe('partial');
  });

  it('treats completed rollback status as the idempotency guard', () => {
    expect(isApartmentImportRollbackComplete('completed')).toBe(true);
    expect(isApartmentImportRollbackComplete('partial')).toBe(false);
    expect(isApartmentImportRollbackComplete(null)).toBe(false);
  });
});
