'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createUserAction } from '@/lib/users/actions';

export function CreateUserForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubmit = (formData: FormData) => {
    setError(null);

    startTransition(async () => {
      const result = await createUserAction(formData);

      if (!result.success) {
        setError(result.error || 'Не удалось создать модератора');
        return;
      }

      formRef.current?.reset();
      router.refresh();
      setShowSuccessToast(true);

      window.setTimeout(() => {
        setShowSuccessToast(false);
      }, 2500);
    });
  };

  return (
    <>
      {showSuccessToast && (
        <div className="fixed right-6 top-6 z-50 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 shadow-lg">
          Модератор создан. При первом входе он должен будет сменить пароль.
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-gray-800">Новый модератор</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="login">Логин</Label>
              <Input id="login" name="login" placeholder="moderator_1" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Стартовый пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Минимум 8 символов"
                required
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Создание...' : 'Создать модератора'}
              </Button>
            </div>
          </form>

          <p className="mt-3 text-sm text-gray-500">
            Через панель можно создавать только модераторов. Системный администратор поддерживается
            отдельно и защищён от удаления. Выданный здесь пароль считается стартовым: при первом
            входе модератор обязан будет заменить его на личный.
          </p>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </>
  );
}
