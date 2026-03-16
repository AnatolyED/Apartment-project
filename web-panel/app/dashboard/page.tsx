import { Suspense } from 'react';
import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import {
  ArrowRight,
  Building2,
  Home,
  Landmark,
  MapPin,
} from 'lucide-react';
import { db } from '@/lib/db';
import { apartments, cities, districts } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function StatsCards() {
  try {
    const [citiesCount, districtsCount, apartmentsCount] = await Promise.all([
      db.select({ count: count() }).from(cities).where(eq(cities.isActive, true)),
      db.select({ count: count() }).from(districts).where(eq(districts.isActive, true)),
      db.select({ count: count() }).from(apartments).where(eq(apartments.isActive, true)),
    ]);

    const stats = [
      {
        title: 'Города',
        value: citiesCount[0]?.count || 0,
        description: 'Активных городов',
        icon: Landmark,
        gradient: 'from-purple-500 to-purple-600',
        color: 'text-purple-600',
        href: '/dashboard/cities',
      },
      {
        title: 'Районы',
        value: districtsCount[0]?.count || 0,
        description: 'Активных районов',
        icon: MapPin,
        gradient: 'from-emerald-500 to-emerald-600',
        color: 'text-emerald-600',
        href: '/dashboard/districts',
      },
      {
        title: 'Квартиры',
        value: apartmentsCount[0]?.count || 0,
        description: 'Активных объектов',
        icon: Home,
        gradient: 'from-blue-500 to-indigo-600',
        color: 'text-blue-600',
        href: '/dashboard/apartments',
      },
    ];

    return (
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card
              key={stat.title}
              className="group relative overflow-hidden border-0 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-5`}
              />

              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} shadow-md transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-2">
                  <div
                    className={`bg-gradient-to-r ${stat.gradient} bg-clip-text text-4xl font-bold text-transparent`}
                  >
                    {stat.value.toLocaleString('ru-RU')}
                  </div>
                  <p className="text-xs text-gray-500">{stat.description}</p>
                </div>

                <Link href={stat.href}>
                  <Button
                    variant="ghost"
                    className={`mt-4 w-full justify-between ${stat.color}`}
                  >
                    <span className="text-sm font-medium">Подробнее</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  } catch (error) {
    console.error('StatsCards error:', error);
    return (
      <div className="py-12 text-center text-gray-500">
        <p>Не удалось загрузить статистику</p>
      </div>
    );
  }
}

function StatsCardsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <Card key={item} className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-12 w-12 animate-pulse rounded-xl bg-gray-200" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-10 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
            </div>
            <div className="mt-4 h-10 w-full animate-pulse rounded bg-gray-200" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickActions() {
  const actions = [
    {
      title: 'Добавить город',
      description: 'Создать новый город',
      href: '/dashboard/cities/new',
      icon: Landmark,
      color: 'from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
    },
    {
      title: 'Добавить район',
      description: 'Создать новый район',
      href: '/dashboard/districts/new',
      icon: MapPin,
      color: 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700',
    },
    {
      title: 'Добавить квартиру',
      description: 'Создать новый объект',
      href: '/dashboard/apartments/new',
      icon: Home,
      color: 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700',
    },
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="text-gray-800">Быстрые действия</CardTitle>
        <p className="text-sm text-gray-500">
          Создайте новый объект недвижимости
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <Link key={action.title} href={action.href}>
                <Button
                  className={`h-auto w-full bg-gradient-to-r px-4 py-4 text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${action.color}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">{action.title}</p>
                      <p className="text-xs opacity-80">{action.description}</p>
                    </div>
                  </div>
                </Button>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards />
      </Suspense>

      <QuickActions />

      <Card className="border-0 bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg">
        <CardContent className="py-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">
                Панель управления недвижимостью
              </h2>
              <p className="max-w-2xl text-slate-300">
                Система учёта и управления объектами недвижимости. Используйте меню
                слева для навигации по разделам.
              </p>
            </div>
            <Building2 className="h-16 w-16 opacity-20" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
