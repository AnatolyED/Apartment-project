/**
 * Страница создания новой квартиры
 * Форма со всеми полями сущности Apartment
 */

'use client';

import { useState, useActionState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createApartmentAction } from '@/lib/apartments/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoUploader } from '@/components/ui/upload/photo-uploader';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { FINISHING_TYPES } from '@/lib/validators';
import { useDistricts } from '../hooks/use-districts';

// ============================================
// Страница создания квартиры
// ============================================

export default function NewApartmentPage() {
  const router = useRouter();
  const { districts, loading } = useDistricts();

  // Состояние для фото (массив File или URL)
  const [photos, setPhotos] = useState<(File | string)[]>([]);

  // Ref для формы
  const formRef = useRef<HTMLFormElement>(null);

  // useActionState для работы с Server Action
  const [state, formAction, isPending] = useActionState<
    { success: boolean; error?: string },
    FormData
  >(async (prevState, formData) => {
    // Добавляем фото в FormData
    photos.forEach((photo, index) => {
      if (photo instanceof File) {
        formData.append('photoFiles', photo);
      }
    });

    const result = await createApartmentAction(formData);

    if (result.success && result.apartment) {
      router.push('/dashboard/apartments');
      router.refresh();
    }

    return result;
  }, { success: false });

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/apartments">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Новая квартира</h1>
          <p className="text-gray-500 mt-1">
            Заполните информацию об объекте
          </p>
        </div>
      </div>

      {/* Форма */}
      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>
            Все поля обязательны для заполнения
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-6">
            {/* Название */}
            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                name="name"
                placeholder="2-к квартира, 65 м²"
                required
              />
            </div>

            {/* Район и отделка */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Район */}
              <div className="space-y-2">
                <Label htmlFor="districtId">Район</Label>
                <Select name="districtId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите район" />
                  </SelectTrigger>
                  <SelectContent>
                    {loading ? (
                      <SelectItem value="loading" disabled>
                        Загрузка...
                      </SelectItem>
                    ) : (
                      districts.map((district: { id: string; name: string }) => (
                        <SelectItem key={district.id} value={district.id}>
                          {district.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Отделка */}
              <div className="space-y-2">
                <Label htmlFor="finishing">Отделка</Label>
                <Select name="finishing" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите отделку" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINISHING_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Комнаты и площадь */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Комнаты */}
              <div className="space-y-2">
                <Label htmlFor="rooms">Комнаты</Label>
                <Input
                  id="rooms"
                  name="rooms"
                  placeholder="2"
                  required
                />
              </div>

              {/* Площадь */}
              <div className="space-y-2">
                <Label htmlFor="area">Площадь (м²)</Label>
                <Input
                  id="area"
                  name="area"
                  type="number"
                  step="0.1"
                  placeholder="65"
                  required
                />
              </div>

              {/* Этаж */}
              <div className="space-y-2">
                <Label htmlFor="floor">Этаж</Label>
                <Input
                  id="floor"
                  name="floor"
                  type="number"
                  placeholder="5"
                  required
                />
              </div>
            </div>

            {/* Цена */}
            <div className="space-y-2">
              <Label htmlFor="price">Цена (₽)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                placeholder="15000000"
                required
              />
            </div>

            {/* Фотографии */}
            <PhotoUploader
              label="Фотографии квартиры"
              maxPhotos={10}
              onChange={setPhotos}
            />

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
                  'Создать квартиру'
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/apartments">Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
