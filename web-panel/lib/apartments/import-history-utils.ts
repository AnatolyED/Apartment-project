export type ApartmentImportHistoryStatus = 'completed' | 'partial' | 'failed';
export type ApartmentImportHistoryRowStatus = 'created' | 'duplicate' | 'failed';
export type ApartmentImportRollbackStatus = 'not_started' | 'completed' | 'partial' | 'failed';
export type ApartmentImportRowRollbackStatus =
  | 'not_started'
  | 'rolled_back'
  | 'already_missing'
  | 'skipped'
  | 'failed';

export interface ApartmentImportHistorySummaryInput {
  totalRows: number;
  submittedRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  previewWarningRows?: number;
  rowWarnings?: number;
}

export interface ApartmentImportHistorySummary extends ApartmentImportHistorySummaryInput {
  warningRows: number;
  status: ApartmentImportHistoryStatus;
}

export function buildApartmentImportHistorySummary(
  input: ApartmentImportHistorySummaryInput
): ApartmentImportHistorySummary {
  const warningRows = Math.max(input.previewWarningRows ?? 0, input.rowWarnings ?? 0);
  const status = resolveApartmentImportHistoryStatus({
    importedRows: input.importedRows,
    duplicateRows: input.duplicateRows,
    errorRows: input.errorRows,
  });

  return {
    ...input,
    warningRows,
    status,
  };
}

export function resolveApartmentImportHistoryStatus(input: {
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
}): ApartmentImportHistoryStatus {
  if (input.errorRows > 0) {
    return input.importedRows > 0 || input.duplicateRows > 0 ? 'partial' : 'failed';
  }

  if (input.importedRows === 0 && input.duplicateRows === 0) {
    return 'failed';
  }

  return 'completed';
}

export interface ApartmentImportRollbackSummaryInput {
  rolledBackRows: number;
  alreadyMissingRows: number;
  skippedRows: number;
  failedRows: number;
}

export interface ApartmentImportRollbackSummary extends ApartmentImportRollbackSummaryInput {
  status: ApartmentImportRollbackStatus;
}

export function buildApartmentImportRollbackSummary(
  input: ApartmentImportRollbackSummaryInput
): ApartmentImportRollbackSummary {
  return {
    ...input,
    status: resolveApartmentImportRollbackStatus(input),
  };
}

export function resolveApartmentImportRollbackStatus(
  input: ApartmentImportRollbackSummaryInput
): ApartmentImportRollbackStatus {
  if (input.failedRows > 0) {
    return input.rolledBackRows > 0 || input.alreadyMissingRows > 0 ? 'partial' : 'failed';
  }

  return 'completed';
}

export function isApartmentImportRollbackComplete(status?: string | null) {
  return status === 'completed';
}
