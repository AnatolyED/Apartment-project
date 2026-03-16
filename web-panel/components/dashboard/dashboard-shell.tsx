'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ShieldAlert,
  Building2,
  ChevronRight,
  Home,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPin,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { handleLogout } from '@/app/dashboard/actions';
import type { SessionData } from '@/lib/auth/session';

function buildNavigation(role: SessionData['role']) {
  const common = [
    {
      title: 'Панель управления',
      href: '/dashboard',
      icon: LayoutDashboard,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    {
      title: 'Города',
      href: '/dashboard/cities',
      icon: Landmark,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
    },
    {
      title: 'Районы',
      href: '/dashboard/districts',
      icon: MapPin,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      title: 'Объекты недвижимости',
      href: '/dashboard/apartments',
      icon: Home,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
    },
  ];

  if (role !== 'admin') {
    return common;
  }

  return [
    ...common,
    {
      title: 'Пользователи',
      href: '/dashboard/users',
      icon: Users,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    {
      title: 'Журнал действий',
      href: '/dashboard/audit',
      icon: ScrollText,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
      border: 'border-cyan-200',
    },
    {
      title: 'События безопасности',
      href: '/dashboard/security',
      icon: ShieldAlert,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
    {
      title: 'Состояние системы',
      href: '/dashboard/system',
      icon: Activity,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
    },
  ];
}

function Sidebar({ session }: { session: SessionData }) {
  const pathname = usePathname();
  const navigation = buildNavigation(session.role);

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-slate-700/50 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">RealtyPanel</h1>
            <p className="text-xs text-slate-400">Управление контентом и сервисами</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Навигация
          </p>
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200 ease-in-out ${
                  isActive
                    ? `${item.bg} ${item.color} ${item.border} shadow-md`
                    : 'border-transparent text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-transform group-hover:scale-110 ${
                    isActive ? 'scale-110' : ''
                  }`}
                />
                <span className="text-sm font-medium">{item.title}</span>
                {isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700/50 p-4">
          <form action={handleLogout}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-slate-300 hover:bg-slate-700/50 hover:text-white"
            >
              <LogOut className="mr-3 h-4 w-4" />
              Выйти из системы
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function Header({ session }: { session: SessionData }) {
  const pathname = usePathname();
  const date = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const titles: Record<string, string> = {
    '/dashboard': 'Панель управления',
    '/dashboard/cities': 'Города',
    '/dashboard/districts': 'Районы',
    '/dashboard/apartments': 'Объекты недвижимости',
    '/dashboard/users': 'Пользователи',
    '/dashboard/audit': 'Журнал действий',
    '/dashboard/security': 'События безопасности',
    '/dashboard/system': 'Состояние системы',
  };

  const title = titles[pathname] || 'Панель управления';
  const roleLabel = session.role === 'admin' ? 'Администратор' : 'Модератор';
  const roleDescription =
    session.role === 'admin'
      ? 'Полный доступ к панели и сервисам'
      : 'Управление каталогом недвижимости';

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-xl">
      <div className="flex h-20 items-center justify-between px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{date}</p>
        </div>

        <div className="flex items-center gap-3 rounded-full border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-md">
            {session.login[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">{session.login}</p>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ShieldCheck className="h-3 w-3" />
              <span>{roleLabel}</span>
              <span>•</span>
              <span>{roleDescription}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function DashboardShell({
  session,
  children,
}: {
  session: SessionData;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50">
      <Sidebar session={session} />
      <main className="pl-72">
        <Header session={session} />
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
