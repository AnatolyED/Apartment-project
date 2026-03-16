import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { count, eq } from 'drizzle-orm';
import { Landmark, Map, MapPin } from 'lucide-react';
import { DeleteEntityButton } from '@/components/ui/delete-entity-button';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { db } from '@/lib/db';
import { districts } from '@/lib/db/schema';
import { deleteCityAction, getCitiesAction } from '@/lib/cities/actions';

async function CitiesTable() {
  const result = await getCitiesAction();
  const cities = result.cities || [];

  const citiesWithDistricts = await Promise.all(
    cities.map(async (city) => {
      const districtsCount = await db
        .select({ count: count() })
        .from(districts)
        .where(eq(districts.cityId, city.id));

      return {
        ...city,
        districtsCount: districtsCount[0]?.count || 0,
      };
    })
  );

  const columns = [
    { key: 'name', label: 'Название' },
    { key: 'description', label: 'Описание' },
    { key: 'districtsCount', label: 'Районов' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
          <Map className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">Карта каталога</p>
          <p className="text-xs text-gray-500">
            Просматривайте города и связанные с ними районы прямо из таблицы.
          </p>
        </div>
      </div>

      <DataTable
        data={citiesWithDistricts}
        columns={columns}
        emptyMessage="Города пока не добавлены. Создайте первый город."
        editUrl={(city) => `/dashboard/cities/${city.id}/edit`}
        renderActions={(city) => (
          <DeleteEntityButton
            action={async function deleteCity() {
              'use server';
              await deleteCityAction(city.id);
              redirect('/dashboard/cities');
            }}
            confirmMessage={`Удалить город "${city.name}"? Вместе с ним будут скрыты связанные районы и квартиры.`}
          />
        )}
        renderCell={(item, key) => {
          if (key === 'districtsCount') {
            return (
              <a
                href={`/dashboard/districts?cityId=${item.id}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {item.districtsCount} шт.
              </a>
            );
          }

          if (key === 'description') {
            return (
              <span className="block max-w-md truncate text-gray-500">
                {item.description || 'Без описания'}
              </span>
            );
          }

          if (key === 'name') {
            return (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 shadow-md">
                  <Landmark className="h-4 w-4 text-white" />
                </div>
                <span className="font-medium text-gray-800">{item.name}</span>
              </div>
            );
          }

          return (item as Record<string, unknown>)[key] as React.ReactNode;
        }}
      />
    </div>
  );
}

async function StatsCards() {
  const citiesResult = await getCitiesAction();
  const totalDistricts = await db
    .select({ count: count() })
    .from(districts)
    .where(eq(districts.isActive, true));

  return (
    <div className="mb-8 grid gap-6 md:grid-cols-2">
      <StatCard
        title="Всего городов"
        value={citiesResult.total || 0}
        description="Активные города в каталоге"
        icon={Landmark}
        gradient="from-purple-500 to-purple-600"
      />
      <StatCard
        title="Всего районов"
        value={totalDistricts[0]?.count || 0}
        description="Активные районы во всех городах"
        icon={MapPin}
        gradient="from-emerald-500 to-emerald-600"
      />
    </div>
  );
}

export default async function CitiesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Управление городами"
        subtitle="Создавайте города, редактируйте описания и следите за количеством районов"
        addButton={{
          href: '/dashboard/cities/new',
          text: 'Добавить город',
        }}
        icon={<Landmark className="h-6 w-6 text-white" />}
      />

      <Suspense
        fallback={
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
          </div>
        }
      >
        <StatsCards />
        <CitiesTable />
      </Suspense>
    </div>
  );
}
