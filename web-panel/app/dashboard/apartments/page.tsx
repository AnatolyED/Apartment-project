import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Home } from 'lucide-react';
import { DeleteEntityButton } from '@/components/ui/delete-entity-button';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { ApartmentsFiltersForm } from '@/components/filters/apartments-filters-form';
import {
  deleteApartmentAction,
  getApartmentsAction,
  type ApartmentsQueryParams,
} from '@/lib/apartments/actions';
import { getCitiesAction } from '@/lib/cities/actions';
import { getDistrictsAction } from '@/lib/districts/actions';

function getStringParam(
  searchParams: { [key: string]: string | string[] | undefined },
  param: string
): string {
  const value = searchParams[param];
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return value || '';
}

function getNumberParam(
  searchParams: { [key: string]: string | string[] | undefined },
  param: string
): number | undefined {
  const value = getStringParam(searchParams, param);
  return value ? parseFloat(value) : undefined;
}

function SortLink({
  sortField,
  currentSort,
  params,
  children,
}: {
  sortField: string;
  currentSort: string;
  params: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  const [field, order] = currentSort.split('_');
  const isActive = field === sortField;
  const nextOrder = isActive && order === 'asc' ? 'desc' : 'asc';
  const nextSort = `${sortField}_${nextOrder}`;

  const currentParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key !== 'sort' && value) {
      currentParams.set(key, Array.isArray(value) ? value[0] : String(value));
    }
  });
  currentParams.set('sort', nextSort);

  return (
    <Link
      href={`/dashboard/apartments?${currentParams.toString()}`}
      className={`flex cursor-pointer items-center gap-1 hover:text-blue-600 ${
        isActive ? 'font-semibold text-blue-600' : ''
      }`}
    >
      {children}
      {isActive && <span className="text-xs">{order === 'asc' ? '▲' : '▼'}</span>}
    </Link>
  );
}

async function ApartmentsTable({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const page = parseInt(getStringParam(params, 'page') || '1', 10);
  const limit = parseInt(getStringParam(params, 'limit') || '20', 10);
  const sort = getStringParam(params, 'sort') || 'created_desc';

  const filters: ApartmentsQueryParams = {
    page,
    limit,
    sort,
    cityId: getStringParam(params, 'cityId') || undefined,
    districtId: getStringParam(params, 'districtId') || undefined,
    finishing: getStringParam(params, 'finishing') || undefined,
    rooms: getStringParam(params, 'rooms') || undefined,
    priceMin: getNumberParam(params, 'priceMin'),
    priceMax: getNumberParam(params, 'priceMax'),
    areaMin: getNumberParam(params, 'areaMin'),
    areaMax: getNumberParam(params, 'areaMax'),
  };

  const [apartmentsResult, districtsResult, citiesResult] = await Promise.all([
    getApartmentsAction(filters),
    getDistrictsAction(),
    getCitiesAction(),
  ]);

  const apartments = apartmentsResult.apartments || [];
  const total = apartmentsResult.total || 0;
  const totalPages = apartmentsResult.totalPages || 0;

  const districtsMap = new Map(
    districtsResult.districts?.map((district) => [district.id, district.name]) || []
  );
  const citiesMap = new Map(
    citiesResult.cities?.map((city) => [city.id, city.name]) || []
  );

  const getCityName = (districtId: string) => {
    const district = districtsResult.districts?.find((item) => item.id === districtId);
    if (!district?.cityId) {
      return 'Неизвестно';
    }

    return citiesMap.get(district.cityId) || 'Неизвестно';
  };

  const columns = [
    { key: 'name', label: 'Название', sortable: true },
    { key: 'cityName', label: 'Город' },
    { key: 'districtName', label: 'Район' },
    { key: 'finishing', label: 'Отделка', sortable: true },
    { key: 'rooms', label: 'Комнат', sortable: true },
    { key: 'area', label: 'Площадь', sortable: true },
    { key: 'floor', label: 'Этаж', sortable: true },
    { key: 'price', label: 'Цена', sortable: true },
  ];

  return (
    <div className="space-y-6">
      <ApartmentsFiltersForm
        cities={citiesResult.cities || []}
        districts={districtsResult.districts || []}
        currentParams={{
          cityId: getStringParam(params, 'cityId') || undefined,
          districtId: getStringParam(params, 'districtId') || undefined,
          finishing: getStringParam(params, 'finishing') || undefined,
          rooms: getStringParam(params, 'rooms') || undefined,
          priceMin: getStringParam(params, 'priceMin') || undefined,
          priceMax: getStringParam(params, 'priceMax') || undefined,
          areaMin: getStringParam(params, 'areaMin') || undefined,
          areaMax: getStringParam(params, 'areaMax') || undefined,
        }}
      />

      <DataTable
        data={apartments.map((apartment) => ({
          ...apartment,
          districtName: districtsMap.get(apartment.districtId) || 'Неизвестно',
          cityName: getCityName(apartment.districtId),
          price: `${Number(apartment.price).toLocaleString('ru-RU')} ₽`,
          area: `${apartment.area} м²`,
        }))}
        columns={columns.map((column) =>
          column.sortable
            ? {
                ...column,
                renderHeader: () => (
                  <SortLink sortField={column.key} currentSort={sort} params={params}>
                    {column.label}
                  </SortLink>
                ),
              }
            : column
        )}
        emptyMessage="Квартиры пока не добавлены. Создайте первый объект."
        imageField="photos"
        editUrl={(apartment) => `/dashboard/apartments/${apartment.id}/edit`}
        renderActions={(apartment) => (
          <DeleteEntityButton
            action={async function deleteApartment() {
              'use server';
              await deleteApartmentAction(apartment.id);
              const currentParams = new URLSearchParams();
              Object.entries(params).forEach(([key, value]) => {
                if (value) {
                  currentParams.set(key, Array.isArray(value) ? value[0] : String(value));
                }
              });
              const target = currentParams.toString()
                ? `/dashboard/apartments?${currentParams.toString()}`
                : '/dashboard/apartments';
              redirect(target);
            }}
            confirmMessage={`Удалить квартиру "${apartment.name}"?`}
          />
        )}
        renderCell={(item, key) => {
          const typedItem = item as Record<string, unknown>;

          if (key === 'finishing') {
            return (
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {typedItem.finishing as React.ReactNode}
              </span>
            );
          }

          if (['area', 'price', 'floor', 'rooms'].includes(key)) {
            return <span className="font-medium text-gray-700">{typedItem[key] as React.ReactNode}</span>;
          }

          return typedItem[key] as React.ReactNode;
        }}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-sm text-gray-500">
            Показано {(page - 1) * limit + 1}-{Math.min(page * limit, total)} из {total}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              Страница {page} из {totalPages}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ApartmentsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ApartmentsPage({ searchParams }: ApartmentsPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Управление объектами недвижимости"
        subtitle="Фильтруйте квартиры по городу, району, цене, площади и отделке"
        addButton={{
          href: '/dashboard/apartments/new',
          text: 'Добавить квартиру',
        }}
        icon={<Home className="h-6 w-6 text-white" />}
      />

      <Suspense
        fallback={
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
          </div>
        }
      >
        <ApartmentsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
