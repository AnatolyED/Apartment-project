import { Activity, Database, FolderOpen, HeartPulse, ServerCog } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requirePageRole } from '@/lib/auth/session';
import { getBotDiagnosticsSummary, getWebPanelHealthStatus } from '@/lib/system/health';

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? 'border border-green-200 bg-green-50 text-green-700' : 'border border-red-200 bg-red-50 text-red-700'
      }`}
    >
      {ok ? 'Норма' : 'Проблема'}
    </span>
  );
}

export default async function SystemPage() {
  await requirePageRole(['admin']);

  const [webPanelHealth, botDiagnostics] = await Promise.all([
    getWebPanelHealthStatus(),
    getBotDiagnosticsSummary(),
  ]);

  const dependencies = [
    {
      title: 'База данных',
      icon: Database,
      status: webPanelHealth.dependencies.database.status === 'ok',
      description: webPanelHealth.dependencies.database.message,
    },
    {
      title: 'Каталог uploads',
      icon: FolderOpen,
      status: webPanelHealth.dependencies.uploads.status === 'ok',
      description: webPanelHealth.dependencies.uploads.message,
    },
    {
      title: 'Telegram-бот',
      icon: HeartPulse,
      status: botDiagnostics.status === 'ok',
      description: botDiagnostics.message,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Состояние системы"
        subtitle="Операционный статус панели, файлового хранилища и Telegram-бота"
        icon={<Activity className="h-6 w-6 text-white" />}
      />

      <div className="grid gap-6 md:grid-cols-3">
        {dependencies.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-gray-800">{item.title}</CardTitle>
                <Icon className="h-5 w-5 text-gray-500" />
              </CardHeader>
              <CardContent className="space-y-3">
                <StatusBadge ok={item.status} />
                <p className="text-sm text-gray-600">{item.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <ServerCog className="h-5 w-5" />
            Детали readiness web-panel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-700">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <span>Общий статус панели</span>
            <StatusBadge ok={webPanelHealth.status === 'ok'} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <span>База данных</span>
            <span>{webPanelHealth.dependencies.database.message}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <span>Файловое хранилище</span>
            <span>{webPanelHealth.dependencies.uploads.message}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <span>Последняя проверка</span>
            <span>{new Date(webPanelHealth.timestampUtc).toLocaleString('ru-RU')}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-gray-800">Сводка бота</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(botDiagnostics, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
