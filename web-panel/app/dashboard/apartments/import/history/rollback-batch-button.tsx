import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rollbackBatchFromHistoryPage } from './rollback-batch-action';

interface RollbackBatchButtonProps {
  batchId: string;
  fileName: string;
  importedRows: number;
  createdCities: string[];
  createdDistricts: string[];
  rollbackStatus: string;
}

export function RollbackBatchButton({
  batchId,
  fileName,
  importedRows,
  createdCities,
  createdDistricts,
  rollbackStatus,
}: RollbackBatchButtonProps) {
  const isRolledBack = rollbackStatus !== 'not_started';

  if (isRolledBack) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Импорт уже отменялся: {rollbackStatus}
      </div>
    );
  }

  return (
    <details className="group relative">
      <summary
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden'
        )}
      >
        <RotateCcw className="h-4 w-4" />
        Отменить импорт
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-3">
            <div>
              <div className="font-medium text-slate-900">Отменить импорт?</div>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Будут удалены квартиры, созданные этим импортом. Автоматически созданные города и
                районы будут удалены только если после отмены они останутся пустыми.
              </p>
            </div>

            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div>
                <span className="font-medium">Файл:</span> {fileName}
              </div>
              <div>
                <span className="font-medium">Квартиры:</span>{' '}
                {importedRows.toLocaleString('ru-RU')}
              </div>
              <div>
                <span className="font-medium">Новые города:</span>{' '}
                {createdCities.length.toLocaleString('ru-RU')}
              </div>
              <div>
                <span className="font-medium">Новые районы:</span>{' '}
                {createdDistricts.length.toLocaleString('ru-RU')}
              </div>
            </div>

            <form action={rollbackBatchFromHistoryPage} className="flex justify-end gap-2">
              <input type="hidden" name="batchId" value={batchId} />
              <Button type="submit" variant="destructive">
                <RotateCcw className="h-4 w-4" />
                Подтвердить отмену
              </Button>
            </form>
          </div>
        </div>
      </div>
    </details>
  );
}
