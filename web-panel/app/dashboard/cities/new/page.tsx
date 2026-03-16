/**
 * Страница создания нового города
 */

'use client';

import { useState, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { createCityAction } from '@/lib/cities/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

// ============================================
// Страница создания города
// ============================================

export default function NewCityPage() {
  const router = useRouter();

  // Ref для формы
  const formRef = useActionStateRef();

  // useActionState для работы с Server Action
  const [state, formAction, isPending] = useActionState<
    { success: boolean; error?: string },
    FormData
  >(async (prevState, formData) => {
    const result = await createCityAction(formData);

    if (result.success && result.city) {
      router.push('/dashboard/cities');
      router.refresh();
    }

    return result;
  }, { success: false });

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/cities">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Новый город</h1>
          <p className="text-gray-500 mt-1">
            Заполните информацию о городе
          </p>
        </div>
      </div>

      {/* Форма */}
      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>
            Название обязательно, описание опционально
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef as any} action={formAction} className="space-y-6">
            {/* Название */}
            <div className="space-y-2">
              <Label htmlFor="name">Название города</Label>
              <Input
                id="name"
                name="name"
                placeholder="Москва"
                required
              />
            </div>

            {/* Описание */}
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Input
                id="description"
                name="description"
                placeholder="Описание города..."
              />
            </div>

            {/* Сообщение об ошибке */}
            {state?.error && (
              <div className="text-red-600 text-sm">{state.error}</div>
            )}

            {/* Кнопки действий */}
            <div className="flex items-center gap-4">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Создать город'
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/cities">Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Хук для получения ref формы
function useActionStateRef() {
  const [ref, setRef] = useState<HTMLFormElement | null>(null);
  return {
    current: ref,
  } as any;
}
