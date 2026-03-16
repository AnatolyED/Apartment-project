'use server';

import { redirect } from 'next/navigation';
import { logoutAction } from '@/lib/auth/actions';

export async function handleLogout() {
  await logoutAction();
  redirect('/login');
}
