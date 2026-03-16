/**
 * Страница редактирования города
 */

'use client';

import { useState, useActionState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { updateCityAction, getCityByIdAction } from '@/lib/cities/actions';
import { FormContainer, FormSection } from '@/components/ui/form-container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { City } from '@/lib/db/schema';

// ============================================
// Страница редактирования города
// ============================================

export default function EditCityPage() {
  const router = useRouter();
  const params = useParams();
  const cityId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState<City | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Загрузка данных города
  useEffect(() => {
    async function loadCity() {
      try {
        const result = await getCityByIdAction(cityId);
        if (result.success && result.city) {
          setCity(result.city);
        }
      } catch (error) {
        console.error('Failed to load city:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCity();
  }, [cityId]);

  // useActionState для работы с Server Action
  const [state, formAction, isPending] = useActionState<
    { success: boolean; error?: string },
    FormData
  >(async (prevState, formData) => {
    const result = await updateCityAction(cityId, formData);

    if (result.success && result.city) {
      router.push('/dashboard/cities');
      router.refresh();
    }

    return result;
  }, { success: false });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!city) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Город не найден</p>
      </div>
    );
  }

  return (
    <FormContainer
      title="Редактирование города"
      subtitle="Измените информацию о городе"
      backUrl="/dashboard/cities"
      submitText="Сохранить изменения"
      isPending={isPending}
      action={formAction}
    >
      <FormSection title="" description="">
        {/* Название */}
        <div className="space-y-2">
          <Label htmlFor="name">Название города *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={city.name}
            placeholder="Москва"
            required
            className="h-11"
          />
        </div>

        {/* Описание */}
        <div className="space-y-2">
          <Label htmlFor="description">Описание</Label>
          <Input
            id="description"
            name="description"
            defaultValue={city.description || ''}
            placeholder="Описание города..."
            className="h-11 md:col-span-2"
          />
        </div>
      </FormSection>

      {/* Сообщение об ошибке */}
      {state?.error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}
    </FormContainer>
  );
}
