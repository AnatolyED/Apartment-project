import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { ChangePasswordForm } from './change-password-form';

export default async function ChangePasswordPage() {
  const session = await requireSession();

  if (!session.mustChangePassword) {
    redirect('/dashboard');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-900 to-teal-900 p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
      </div>

      <div className="relative z-10 w-full">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
