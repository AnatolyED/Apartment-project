import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Ban, ShieldCheck, Users, UserCog } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { DeleteEntityButton } from '@/components/ui/delete-entity-button';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { CreateUserForm } from '@/components/dashboard/create-user-form';
import { ToggleUserBlockSubmitButton } from '@/components/ui/toggle-user-block-submit-button';
import {
  deleteUserAction,
  getUsersAction,
  toggleUserBlockedAction,
} from '@/lib/users/actions';
import { requirePageRole } from '@/lib/auth/session';

async function UsersStats() {
  const result = await getUsersAction();
  const users = result.users || [];
  const admins = users.filter((user) => user.role === 'admin').length;
  const moderators = users.filter((user) => user.role === 'moderator').length;
  const blocked = users.filter((user) => user.isBlocked).length;

  return (
    <div className="mb-8 grid gap-6 md:grid-cols-4">
      <StatCard
        title="Администраторы"
        value={admins}
        description="Активные пользователи с полным доступом"
        icon={ShieldCheck}
        gradient="from-amber-500 to-orange-600"
      />
      <StatCard
        title="Модераторы"
        value={moderators}
        description="Пользователи, работающие с каталогом"
        icon={Users}
        gradient="from-blue-500 to-indigo-600"
      />
      <StatCard
        title="Всего пользователей"
        value={users.length}
        description="Все активные учётные записи панели"
        icon={UserCog}
        gradient="from-emerald-500 to-teal-600"
      />
      <StatCard
        title="Заблокированы"
        value={blocked}
        description="Учётные записи с временно отключённым входом"
        icon={Ban}
        gradient="from-rose-500 to-red-600"
      />
    </div>
  );
}

async function UsersTable() {
  const result = await getUsersAction();
  const users = result.users || [];
  const tableData = users.map((user) => ({
    ...user,
    name: user.login,
    roleLabel: user.role === 'admin' ? 'Администратор' : 'Модератор',
    typeLabel: user.isProtected ? 'Системный аккаунт' : 'Обычная учётная запись',
    accessStateLabel: user.isBlocked ? 'Заблокирован' : 'Активен',
    passwordStateLabel: user.mustChangePassword
      ? 'Ожидает смену пароля'
      : 'Пароль подтверждён',
    lastLoginLabel: user.lastLoginAt
      ? new Date(user.lastLoginAt).toLocaleString('ru-RU')
      : 'Ещё не входил',
  }));

  type UserTableRow = (typeof tableData)[number];

  const columns = [
    { key: 'login', label: 'Логин' },
    { key: 'roleLabel', label: 'Роль' },
    { key: 'typeLabel', label: 'Тип' },
    { key: 'accessStateLabel', label: 'Доступ' },
    { key: 'passwordStateLabel', label: 'Статус пароля' },
    { key: 'lastLoginLabel', label: 'Последний вход' },
  ];

  return (
    <DataTable
      data={tableData}
      columns={columns}
      emptyMessage="Пользователи не найдены"
      editUrl={(user) => `/dashboard/users/${user.id}/edit`}
      renderCell={(item: UserTableRow, key) => {
        if (key === 'roleLabel') {
          return (
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                item.role === 'admin'
                  ? 'border border-amber-200 bg-amber-50 text-amber-700'
                  : 'border border-blue-200 bg-blue-50 text-blue-700'
              }`}
            >
              {item.roleLabel}
            </span>
          );
        }

        if (key === 'typeLabel') {
          return item.isProtected ? (
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {item.typeLabel}
            </span>
          ) : (
            <span className="text-gray-600">{item.typeLabel}</span>
          );
        }

        if (key === 'passwordStateLabel') {
          return item.mustChangePassword ? (
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              {item.passwordStateLabel}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {item.passwordStateLabel}
            </span>
          );
        }

        if (key === 'accessStateLabel') {
          return item.isBlocked ? (
            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
              {item.accessStateLabel}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {item.accessStateLabel}
            </span>
          );
        }

        return item[key as keyof UserTableRow] as ReactNode;
      }}
      renderActions={(user: UserTableRow) =>
        user.isProtected ? (
          <span className="px-2 text-xs font-medium text-emerald-700">Защищён</span>
        ) : (
          <>
            <form
              action={async function toggleUserBlocked() {
                'use server';
                await toggleUserBlockedAction(user.id);
                redirect('/dashboard/users');
              }}
            >
              <ToggleUserBlockSubmitButton
                isBlocked={user.isBlocked}
                confirmMessage={
                  user.isBlocked
                    ? `Разблокировать пользователя "${user.login}"?`
                    : `Заблокировать пользователя "${user.login}"? Его активные сессии будут завершены.`
                }
              />
            </form>
            <DeleteEntityButton
              action={async function deleteUser() {
                'use server';
                await deleteUserAction(user.id);
                redirect('/dashboard/users');
              }}
              confirmMessage={`Удалить пользователя "${user.login}"?`}
            />
          </>
        )
      }
    />
  );
}

export default async function UsersPage() {
  await requirePageRole(['admin']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Управление пользователями"
        subtitle="Создание модераторов, редактирование данных и защита системного администратора"
        icon={<Users className="h-6 w-6 text-white" />}
      />

      <Suspense fallback={<div className="py-12 text-center">Загрузка пользователей...</div>}>
        <UsersStats />
        <CreateUserForm />
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <UsersTable />
          </CardContent>
        </Card>
      </Suspense>
    </div>
  );
}
