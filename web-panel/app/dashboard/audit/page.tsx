import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requirePageRole } from '@/lib/auth/session';
import { getAuditLogsAction } from '@/lib/audit/actions';

function getActionLabel(action: string) {
  switch (action) {
    case 'user.created':
      return 'Создание пользователя';
    case 'user.reactivated':
      return 'Повторная активация пользователя';
    case 'user.updated':
      return 'Редактирование пользователя';
    case 'user.deleted':
      return 'Удаление пользователя';
    case 'user.blocked':
      return 'Блокировка пользователя';
    case 'user.unblocked':
      return 'Разблокировка пользователя';
    case 'city.created':
      return 'Создание города';
    case 'city.updated':
      return 'Редактирование города';
    case 'city.deleted':
      return 'Удаление города';
    case 'district.created':
      return 'Создание района';
    case 'district.updated':
      return 'Редактирование района';
    case 'district.deleted':
      return 'Удаление района';
    case 'apartment.created':
      return 'Создание квартиры';
    case 'apartment.updated':
      return 'Редактирование квартиры';
    case 'apartment.deleted':
      return 'Удаление квартиры';
    default:
      return action;
  }
}

function getEntityLabel(entityType: string) {
  switch (entityType) {
    case 'user':
      return 'Пользователь';
    case 'city':
      return 'Город';
    case 'district':
      return 'Район';
    case 'apartment':
      return 'Квартира';
    case 'security':
      return 'Безопасность';
    default:
      return entityType;
  }
}

export default async function AuditPage() {
  await requirePageRole(['admin']);
  const result = await getAuditLogsAction(100);
  const logs = (result.logs || []).filter((log) => !log.action.startsWith('auth.'));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Журнал действий"
        subtitle="История ключевых изменений в пользователях и каталоге"
        icon={<ScrollText className="h-6 w-6 text-white" />}
      />

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-gray-800">Последние события</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
              В журнале пока нет записей.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Когда</th>
                    <th className="px-4 py-3 font-medium">Кто</th>
                    <th className="px-4 py-3 font-medium">Действие</th>
                    <th className="px-4 py-3 font-medium">Сущность</th>
                    <th className="px-4 py-3 font-medium">Объект</th>
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
                          {log.actorRole === 'admin' ? 'Администратор' : 'Модератор'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{getActionLabel(log.action)}</td>
                      <td className="px-4 py-3 text-gray-600">{getEntityLabel(log.entityType)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">
                          {log.entityLabel || 'Без названия'}
                        </div>
                        {log.entityId && (
                          <div className="mt-1 break-all text-xs text-gray-500">{log.entityId}</div>
                        )}
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
