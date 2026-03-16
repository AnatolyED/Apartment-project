import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { Filter, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteEntityButton } from '@/components/ui/delete-entity-button';
import { DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { db } from '@/lib/db';
import { apartments } from '@/lib/db/schema';
import { getCitiesAction } from '@/lib/cities/actions';
import { deleteDistrictAction, getDistrictsAction } from '@/lib/districts/actions';

async function DistrictsTable({ searchParams }: { searchParams: { cityId?: string } }) {
  const result = await getDistrictsAction();
  const citiesResult = await getCitiesAction();
  let districtsList = result.districts || [];

  if (searchParams.cityId && searchParams.cityId !== 'all') {
    districtsList = districtsList.filter((district) => district.cityId === searchParams.cityId);
  }

  const districtsApartmentsCount = await Promise.all(
    districtsList.map(async (district) => {
      const apartmentsCount = await db
        .select({ count: count() })
        .from(apartments)
        .where(and(eq(apartments.districtId, district.id), eq(apartments.isActive, true)));

      return {
        ...district,
        apartmentsCount: apartmentsCount[0]?.count || 0,
      };
    })
  );

  const citiesMap = new Map(citiesResult.cities?.map((city) => [city.id, city.name]) || []);
  const hasActiveFilter = searchParams.cityId && searchParams.cityId !== 'all';

  const columns = [
    { key: 'cityName', label: 'Город' },
    { key: 'name', label: 'Название района' },
    { key: 'description', label: 'Описание' },
    { key: 'apartmentsCount', label: 'Квартир' },
  ];

  return (
    <div className="space-y-6">
      <form
        method="GET"
        className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-3"
      >
        <Filter className="h-5 w-5 text-emerald-600" />
        <Label htmlFor="cityId" className="whitespace-nowrap font-medium text-gray-700">
          Фильтр по городу:
        </Label>
        <Select name="cityId" defaultValue={searchParams.cityId || 'all'}>
          <SelectTrigger className="h-10 w-64">
            <SelectValue placeholder="Все города" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все города</SelectItem>
            {citiesResult.cities?.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
          Применить
        </Button>
        {hasActiveFilter && (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/districts" className="flex items-center gap-1">
              <X className="h-4 w-4" />
              Сбросить
            </Link>
          </Button>
        )}
      </form>

      <DataTable
        data={districtsApartmentsCount.map((district) => ({
          ...district,
          cityName: citiesMap.get(district.cityId) || 'Неизвестно',
        }))}
        columns={columns}
        emptyMessage="Районы пока не добавлены. Создайте первый район."
        imageField="photos"
        editUrl={(district) => `/dashboard/districts/${district.id}/edit`}
        renderActions={(district) => (
          <DeleteEntityButton
            action={async function deleteDistrict() {
              'use server';
              await deleteDistrictAction(district.id);
              const target =
                searchParams.cityId && searchParams.cityId !== 'all'
                  ? `/dashboard/districts?cityId=${searchParams.cityId}`
                  : '/dashboard/districts';
              redirect(target);
            }}
            confirmMessage={`Удалить район "${district.name}"? Вместе с ним будут скрыты связанные квартиры.`}
          />
        )}
        renderCell={(item, key) => {
          if (key === 'apartmentsCount') {
            return (
              <a
                href={`/dashboard/apartments?districtId=${item.id}${item.cityId ? `&cityId=${item.cityId}` : ''}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {item.apartmentsCount} шт.
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

          return (item as Record<string, unknown>)[key] as React.ReactNode;
        }}
      />
    </div>
  );
}

interface DistrictsPageProps {
  searchParams: Promise<{ cityId?: string }>;
}

export default async function DistrictsPage({ searchParams }: DistrictsPageProps) {
  const params = await searchParams;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Управление районами"
        subtitle={
          params.cityId
            ? 'Список районов выбранного города с быстрым переходом к квартирам'
            : 'Все районы каталога с фото, описанием и количеством квартир'
        }
        addButton={{
          href: '/dashboard/districts/new',
          text: 'Добавить район',
        }}
        icon={<MapPin className="h-6 w-6 text-white" />}
      />

      <Suspense
        fallback={
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500" />
          </div>
        }
      >
        <DistrictsTable searchParams={params} />
      </Suspense>
    </div>
  );
}
