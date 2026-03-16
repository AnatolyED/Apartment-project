import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();

  if (session.mustChangePassword) {
    redirect('/change-password');
  }

  return <DashboardShell session={session}>{children}</DashboardShell>;
}
