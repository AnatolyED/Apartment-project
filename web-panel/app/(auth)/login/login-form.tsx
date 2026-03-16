'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/lib/auth/actions';
import { Building2, Loader2, Lock, Sparkles, User } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const handleSubmit = (formData: FormData) => {
    setError(null);

    startTransition(async () => {
      const result = await loginAction(formData);

      if (!result.success) {
        setError(result.error || 'Не удалось войти в систему');
        return;
      }

      formRef.current?.reset();
      router.push(result.redirectUrl || '/dashboard');
      router.refresh();
    });
  };

  return (
    <Card className="w-full max-w-md border-0 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="space-y-6 p-8">
        <div className="space-y-2 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent">
            Система управления недвижимостью
          </h1>
          <p className="text-sm text-gray-500">Авторизация администратора или модератора</p>
        </div>

        <form ref={formRef} action={handleSubmit} className="space-y-5">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />

          <div className="space-y-2">
            <Label htmlFor="login" className="text-sm font-medium text-gray-700">
              Логин
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="login"
                name="login"
                type="text"
                placeholder="admin"
                className="h-11 border-gray-200 pl-10 transition-colors focus:border-blue-500 focus:ring-blue-500"
                autoComplete="username"
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              Пароль
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                className="h-11 border-gray-200 pl-10 transition-colors focus:border-blue-500 focus:ring-blue-500"
                autoComplete="current-password"
                required
                disabled={isPending}
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 font-medium text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Вход...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Войти в систему
              </>
            )}
          </Button>
        </form>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-center text-xs text-gray-500">
            Введите учётные данные для доступа к системе
          </p>
        </div>
      </div>
    </Card>
  );
}
