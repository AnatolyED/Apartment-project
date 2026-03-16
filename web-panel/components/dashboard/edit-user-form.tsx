'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/db/schema';
import { updateUserAction } from '@/lib/users/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditUserForm({ user }: { user: User }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubmit = (formData: FormData) => {
    setError(null);

    startTransition(async () => {
      const result = await updateUserAction(user.id, formData);

      if (!result.success) {
        setError(result.error || 'Не удалось обновить пользователя');
        return;
      }

      formRef.current?.reset();
      setShowSuccessToast(true);

      window.setTimeout(() => {
        setShowSuccessToast(false);
      }, 2500);

      router.push(result.redirectUrl || '/dashboard/users');
      router.refresh();
    });
  };

  return (
    <>
      {showSuccessToast && (
        <div className="fixed right-6 top-6 z-50 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 shadow-lg">
          Данные пользователя сохранены.
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Редактирование пользователя</CardTitle>
          <CardDescription>
            Измените логин и при необходимости назначьте новый пароль. Если пароль будет обновлён,
            все активные сессии пользователя завершатся, а сам пользователь будет обязан сменить
            этот пароль при следующем входе.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="login">Логин</Label>
                <Input id="login" name="login" defaultValue={user.login} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Роль</Label>
                <Input
                  id="role"
                  value={user.role === 'admin' ? 'Администратор' : 'Модератор'}
                  disabled
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Новый пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Оставьте пустым, если менять пароль не нужно"
              />
            </div>

            {user.isProtected && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertDescription>
                  Это защищённый системный администратор. Его нельзя удалить через панель.
                </AlertDescription>
              </Alert>
            )}

            {!user.isProtected && (
              <Alert className="border-blue-200 bg-blue-50 text-blue-900">
                <AlertDescription>
                  Если вы назначите новый пароль модератору, при следующем входе он увидит экран
                  обязательной смены пароля и должен будет задать личный пароль сам.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Сохранение...' : 'Сохранить изменения'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/dashboard/users')}>
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
