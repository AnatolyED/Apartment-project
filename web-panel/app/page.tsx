/**
 * Корневая страница — редирект на dashboard
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const session = await getSession();
  
  if (session?.isAuthenticated) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
