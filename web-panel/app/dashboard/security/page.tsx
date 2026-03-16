import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requirePageRole } from '@/lib/auth/session';
import { getSecurityLogsAction } from '@/lib/audit/actions';

function getSecurityActionLabel(action: string) {
  switch (action) {
    case 'auth.login_success':
      return 'Успешный вход';
    case 'auth.login_failed':
      return 'Неудачная попытка входа';
    case 'auth.login_failed_locked':
      return 'Неудачный вход с последующей временной блокировкой';
    case 'auth.login_locked':
      return 'Попытка входа в период временной блокировки';
    case 'auth.login_blocked_user':
      return 'Попытка входа в заблокированную учётную запись';
    case 'auth.password_change_required':
      return 'Требуется обязательная смена пароля';
    case 'auth.password_changed':
      return 'Пользователь сменил пароль после выдачи стартового';
    case 'user.blocked':
      return 'Администратор заблокировал пользователя';
    case 'user.unblocked':
      return 'Администратор разблокировал пользователя';
    default:
      return action;
  }
}

function renderDetails(details: unknown) {
  if (!details || typeof details !== 'object') {
    return null;
  }

  const record = details as Record<string, unknown>;
  const detailLines: string[] = [];

  if (typeof record.ipAddress === 'string' && record.ipAddress) {
    detailLines.push(`IP: ${record.ipAddress}`);
  }

  if (typeof record.retryAfterSeconds === 'number' && record.retryAfterSeconds > 0) {
    detailLines.push(`Повтор через: ${record.retryAfterSeconds} сек.`);
  }

  if (record.blocked === true) {
    detailLines.push('Учётная запись уже была заблокирована');
  }

  if (record.mustChangePassword === true) {
    detailLines.push('Требуется смена пароля');
  }

  if (record.forcedChangeCompleted === true) {
    detailLines.push('Обязательная смена пароля завершена');
  }

  if (detailLines.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 space-y-1 text-xs text-gray-500">
      {detailLines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

export default async function SecurityPage() {
  await requirePageRole(['admin']);
  const result = await getSecurityLogsAction(100);
  const logs = result.logs || [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="События безопасности"
        subtitle="История входов, блокировок и других важных событий доступа"
        icon={<ShieldAlert className="h-6 w-6 text-white" />}
      />

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-gray-800">Последние события безопасности</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
              В журнале безопасности пока нет записей.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Когда</th>
                    <th className="px-4 py-3 font-medium">Кто</th>
                    <th className="px-4 py-3 font-medium">Событие</th>
                    <th className="px-4 py-3 font-medium">Подробности</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(log.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{log.actorLogin}</div>
                        <div className="text-xs text-gray-500">
                          {log.actorRole === 'admin' ? 'Администратор' : 'Модератор / попытка входа'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {getSecurityActionLabel(log.action)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">
                          {log.entityLabel || 'Без названия'}
                        </div>
                        {renderDetails(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
