'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getApartmentByIdAction, updateApartmentAction } from '@/lib/apartments/actions';
import { getDistrictsAction } from '@/lib/districts/actions';
import type { Apartment } from '@/lib/db/schema';
import { FINISHING_TYPES } from '@/lib/validators';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PhotoUploader } from '@/components/ui/upload/photo-uploader';

export default function EditApartmentPage() {
  const router = useRouter();
  const params = useParams();
  const apartmentId = params.id as string;

  const [photos, setPhotos] = useState<(File | string)[]>([]);
  const [deletedPhotoUrls, setDeletedPhotoUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [districts, setDistricts] = useState<Array<{ id: string; name: string }>>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [apartmentResult, districtsResult] = await Promise.all([
          getApartmentByIdAction(apartmentId),
          getDistrictsAction(),
        ]);

        if (apartmentResult.success && apartmentResult.apartment) {
          setApartment(apartmentResult.apartment);
          setPhotos(apartmentResult.apartment.photos || []);
        }

        if (districtsResult.success && districtsResult.districts) {
          setDistricts(districtsResult.districts);
        }
      } catch (error) {
        console.error('Failed to load apartment edit data:', error);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [apartmentId]);

  const [state, formAction, isPending] = useActionState<
    { success: boolean; error?: string },
    FormData
  >(
    async (_prevState, formData) => {
      photos.forEach((photo) => {
        if (photo instanceof File) {
          formData.append('photoFiles', photo);
        }
      });

      photos.forEach((photo) => {
        if (typeof photo === 'string' && !deletedPhotoUrls.includes(photo)) {
          formData.append('currentPhotos', photo);
        }
      });

      deletedPhotoUrls.forEach((url) => {
        formData.append('deletedPhotoUrls', url);
      });

      const result = await updateApartmentAction(apartmentId, formData);

      if (result.success && result.apartment) {
        formRef.current?.reset();
        router.push('/dashboard/apartments');
        router.refresh();
      }

      return result;
    },
    { success: false }
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Квартира не найдена</p>
      </div>
    );
  }

  const apartmentPrice = Math.round(Number(apartment.price)).toString();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/apartments">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Редактирование квартиры</h1>
          <p className="mt-1 text-gray-500">Измените информацию о квартире</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>Измените данные квартиры</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                name="name"
                defaultValue={apartment.name}
                placeholder="Квартира №1"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rooms">Комнаты</Label>
                <Input id="rooms" name="rooms" defaultValue={apartment.rooms} placeholder="2" required />
              </div>

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

            <div className="space-y-2">
              <Label htmlFor="price">Цена (₽)</Label>
              <Input
                id="price"
                name="price"
                type="text"
                inputMode="numeric"
                defaultValue={apartmentPrice}
                placeholder="15000000"
                required
              />
              <p className="text-xs text-gray-500">Указывайте цену целым числом, без копеек.</p>
            </div>

            <PhotoUploader
              label="Фотографии квартиры"
              maxPhotos={10}
              existingPhotos={photos.filter((photo): photo is string => typeof photo === 'string')}
              onChange={setPhotos}
              onExistingPhotoDelete={(url) => {
                setDeletedPhotoUrls((prev) => [...prev, url]);
              }}
            />

            {state?.error && <div className="text-sm text-red-600">{state.error}</div>}

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
