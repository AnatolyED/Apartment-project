import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EditUserForm } from '@/components/dashboard/edit-user-form';
import { getUserByIdAction } from '@/lib/users/actions';
import { requirePageRole } from '@/lib/auth/session';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageRole(['admin']);
  const { id } = await params;
  const result = await getUserByIdAction(id);

  if (!result.success || !result.user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Редактирование: ${result.user.login}`}
        subtitle="Обновите логин пользователя и при необходимости назначьте новый пароль"
        icon={<UserCog className="h-6 w-6 text-white" />}
      />

      <EditUserForm user={result.user} />
    </div>
  );
}
