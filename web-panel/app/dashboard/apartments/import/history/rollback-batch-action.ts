'use server';

import { redirect } from 'next/navigation';
import { rollbackApartmentImportBatchAction } from '@/lib/apartments/import-history';

export async function rollbackBatchFromHistoryPage(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '');

  if (!batchId) {
    redirect('/dashboard/apartments/import/history?rollback=missing_batch');
  }

  const result = await rollbackApartmentImportBatchAction({ id: batchId });
  const rollbackResult = !result.success
    ? 'failed'
    : result.alreadyRolledBack
      ? 'already'
      : 'completed';

  redirect(
    `/dashboard/apartments/import/history?batch=${encodeURIComponent(batchId)}&rollback=${rollbackResult}`
  );
}
