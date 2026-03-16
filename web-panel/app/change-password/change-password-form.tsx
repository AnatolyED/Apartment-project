'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeOwnPasswordAction } from '@/lib/auth/actions';
import { KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';

export function ChangePasswordForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);

    startTransition(async () => {
      const result = await changeOwnPasswordAction(formData);

      if (!result.success) {
        setError(result.error || 'Не удалось обновить пароль');
        return;
      }

      formRef.current?.reset();
      router.push(result.redirectUrl || '/dashboard');
      router.refresh();
    });
  };

  return (
    <Card className="w-full max-w-lg border-0 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="space-y-6 p-8">
        <div className="space-y-3 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Обязательная смена пароля</h1>
          <p className="text-sm text-slate-500">
            Администратор выдал вам стартовый пароль. Перед началом работы задайте личный пароль.
          </p>
        </div>

        <Alert className="border-blue-200 bg-blue-50 text-blue-900">
          <AlertDescription>
            После смены пароля текущая сессия будет обновлена. Вход со старым паролем больше не
            сработает.
          </AlertDescription>
        </Alert>

        <form ref={formRef} action={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">Новый пароль</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Минимум 8 символов"
                className="h-11 border-gray-200 pl-10"
                autoComplete="new-password"
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Подтверждение пароля</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Повторите новый пароль"
                className="h-11 border-gray-200 pl-10"
                autoComplete="new-password"
                required
                disabled={isPending}
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Сохраняем...
              </>
            ) : (
              'Сменить пароль и продолжить'
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}
