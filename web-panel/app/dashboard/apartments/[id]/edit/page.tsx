/**
 * Страница редактирования квартиры
 */

'use client';

import { useState, useActionState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { updateApartmentAction, getApartmentByIdAction } from '@/lib/apartments/actions';
import { getDistrictsAction } from '@/lib/districts/actions';
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
import type { Apartment } from '@/lib/db/schema';

// ============================================
// Страница редактирования квартиры
// ============================================

export default function EditApartmentPage() {
  const router = useRouter();
  const params = useParams();
  const apartmentId = params.id as string;

  // Состояние для фото
  const [photos, setPhotos] = useState<(File | string)[]>([]);
  const [deletedPhotoUrls, setDeletedPhotoUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [districts, setDistricts] = useState<Array<{ id: string; name: string }>>([]);

  // Ref для формы
  const formRef = useRef<HTMLFormElement>(null);

  // Загрузка данных
  useEffect(() => {
    async function loadData() {
      try {
        const [aptResult, distResult] = await Promise.all([
          getApartmentByIdAction(apartmentId),
          getDistrictsAction(),
        ]);

        if (aptResult.success && aptResult.apartment) {
          setApartment(aptResult.apartment);
          setPhotos(aptResult.apartment.photos || []);
        }

        if (distResult.success && distResult.districts) {
          setDistricts(distResult.districts);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [apartmentId]);

  // useActionState для работы с Server Action
  const [state, formAction, isPending] = useActionState<
    { success: boolean; error?: string },
    FormData
  >(async (prevState, formData) => {
    // Добавляем новые фото в FormData
    photos.forEach((photo) => {
      if (photo instanceof File) {
        formData.append('photoFiles', photo);
      }
    });

    // Добавляем текущие фото (строки URL), кроме удалённых
    photos.forEach((photo) => {
      if (typeof photo === 'string' && !deletedPhotoUrls.includes(photo)) {
        formData.append('currentPhotos', photo);
      }
    });

    // Добавляем URL удалённых фото
    deletedPhotoUrls.forEach((url) => {
      formData.append('deletedPhotoUrls', url);
    });

    const result = await updateApartmentAction(apartmentId, formData);

    if (result.success && result.apartment) {
      router.push('/dashboard/apartments');
      router.refresh();
    }

    return result;
  }, { success: false });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Квартира не найдена</p>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold tracking-tight">Редактирование квартиры</h1>
          <p className="text-gray-500 mt-1">
            Измените информацию о квартире
          </p>
        </div>
      </div>

      {/* Форма */}
      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>
            Измените данные квартиры
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
                defaultValue={apartment.name}
                placeholder="2-к квартира, 65 м²"
                required
              />
            </div>

            {/* Район и отделка */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Район */}
              <div className="space-y-2">
                <Label htmlFor="districtId">Район</Label>
                <Select name="districtId" defaultValue={apartment.districtId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите район" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((district) => (
                      <SelectItem key={district.id} value={district.id}>
                        {district.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Отделка */}
              <div className="space-y-2">
                <Label htmlFor="finishing">Отделка</Label>
                <Select name="finishing" defaultValue={apartment.finishing}>
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

            {/* Комнаты, площадь, этаж */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Комнаты */}
              <div className="space-y-2">
                <Label htmlFor="rooms">Комнаты</Label>
                <Input
                  id="rooms"
                  name="rooms"
                  defaultValue={apartment.rooms}
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
                  defaultValue={apartment.area}
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
                  defaultValue={apartment.floor}
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
                defaultValue={apartment.price}
                placeholder="15000000"
                required
              />
            </div>

            {/* Фотографии */}
            <PhotoUploader
              label="Фотографии квартиры"
              maxPhotos={10}
              existingPhotos={photos.filter((p): p is string => typeof p === 'string')}
              onChange={setPhotos}
              onExistingPhotoDelete={(url) => {
                setDeletedPhotoUrls((prev) => [...prev, url]);
              }}
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
                  'Сохранить изменения'
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
