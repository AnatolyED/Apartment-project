'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createApartmentAction } from '@/lib/apartments/actions';
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
import { useDistricts } from '../hooks/use-districts';

export default function NewApartmentPage() {
  const router = useRouter();
  const { districts, loading } = useDistricts();
  const [photos, setPhotos] = useState<(File | string)[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

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

      const result = await createApartmentAction(formData);

      if (result.success && result.apartment) {
        formRef.current?.reset();
        router.push('/dashboard/apartments');
        router.refresh();
      }

      return result;
    },
    { success: false }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/apartments">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Новая квартира</h1>
          <p className="mt-1 text-gray-500">Заполните информацию об объекте</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>Все поля обязательны для заполнения</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input id="name" name="name" placeholder="Квартира №1" required />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rooms">Комнаты</Label>
                <Input id="rooms" name="rooms" placeholder="2" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="area">Площадь (м²)</Label>
                <Input id="area" name="area" type="number" step="0.1" placeholder="65" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="floor">Этаж</Label>
                <Input id="floor" name="floor" type="number" placeholder="5" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Цена (₽)</Label>
              <Input
                id="price"
                name="price"
                type="text"
                inputMode="numeric"
                placeholder="15000000"
                required
              />
              <p className="text-xs text-gray-500">Указывайте цену целым числом, без копеек.</p>
            </div>

            <PhotoUploader
              label="Фотографии квартиры"
              maxPhotos={10}
              onChange={setPhotos}
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
