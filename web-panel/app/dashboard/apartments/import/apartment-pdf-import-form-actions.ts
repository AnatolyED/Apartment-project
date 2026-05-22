'use server';

import { redirect } from 'next/navigation';
import {
  analyzeApartmentPdfImportAction,
  confirmApartmentPdfImportAction,
} from '@/lib/apartments/import-actions';

export async function analyzeApartmentPdfImportFromPageAction(formData: FormData) {
  const result = await analyzeApartmentPdfImportAction(formData);

  if (result.success && result.importId) {
    redirect(`/dashboard/apartments/import?preview=${encodeURIComponent(result.importId)}`);
  }

  const error = result.error || 'Не удалось проанализировать PDF.';
  redirect(`/dashboard/apartments/import?error=${encodeURIComponent(error)}`);
}

export async function confirmApartmentPdfImportFromPageAction(formData: FormData) {
  const importId = String(formData.get('importId') ?? '');
  if (!importId) {
    redirect(
      `/dashboard/apartments/import?error=${encodeURIComponent('Preview импорта не найден. Запустите анализ PDF заново.')}`
    );
  }

  type ConfirmPayload = Parameters<typeof confirmApartmentPdfImportAction>[0];
  type ConfirmRow = ConfirmPayload['rows'][number];
  const rowIndexes = Array.from(formData.keys())
    .map((key) => key.match(/^rows\.(\d+)\.rowId$/)?.[1])
    .filter((value): value is string => !!value)
    .map((value) => Number(value))
    .filter(Number.isInteger)
    .sort((left, right) => left - right);

  const getLastFormValue = (key: string) => {
    const values = formData.getAll(key);
    const value = values.at(-1);
    return typeof value === 'string' ? value : undefined;
  };
  const getRowValue = (rowId: string, index: number, field: string) => {
    const overrideKey = `row.${rowId}.${field}`;
    if (formData.has(overrideKey)) {
      return getLastFormValue(overrideKey) ?? '';
    }

    return String(formData.get(`rows.${index}.${field}`) ?? '');
  };
  const getRowEnabled = (rowId: string, index: number) => {
    const overrideKey = `row.${rowId}.enabled`;
    if (formData.has(overrideKey)) {
      return getLastFormValue(overrideKey) === 'true';
    }

    return formData.get(`rows.${index}.enabled`) === 'true';
  };

  const rows: ConfirmRow[] = rowIndexes.map((index) => ({
    rowId: String(formData.get(`rows.${index}.rowId`) ?? ''),
    enabled: getRowEnabled(String(formData.get(`rows.${index}.rowId`) ?? ''), index),
    cityName: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'cityName'),
    districtName: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'districtName'),
    name: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'name'),
    finishing: getRowValue(
      String(formData.get(`rows.${index}.rowId`) ?? ''),
      index,
      'finishing'
    ) as ConfirmRow['finishing'],
    rooms: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'rooms'),
    area: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'area'),
    floor: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'floor'),
    price: getRowValue(String(formData.get(`rows.${index}.rowId`) ?? ''), index, 'price'),
  }));

  const result = await confirmApartmentPdfImportAction({
    importId,
    mode: 'rules',
    rows,
  });

  const status = result.success ? 'completed' : 'failed';
  redirect(
    `/dashboard/apartments/import/history?import=${status}&created=${result.importedCount ?? 0}&duplicates=${result.skippedDuplicates ?? 0}&errors=${result.failedCount ?? 0}`
  );
}
