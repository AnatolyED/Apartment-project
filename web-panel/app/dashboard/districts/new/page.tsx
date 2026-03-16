'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createDistrictAction } from '@/lib/districts/actions';
import { getCitiesAction } from '@/lib/cities/actions';
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

type CityOption = {
  id: string;
  name: string;
};

export default function NewDistrictPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const [photos, setPhotos] = useState<(File | string)[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [cityId, setCityId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCities() {
      const result = await getCitiesAction();
      if (result.success && result.cities) {
        setCities(result.cities);
      }
    }

    loadCities();
  }, []);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    formData.set('cityId', cityId);

    photos.forEach((photo) => {
      if (photo instanceof File) {
        formData.append('photoFiles', photo);
      }
    });

    startTransition(async () => {
      const result = await createDistrictAction(formData);

      if (!result.success) {
        setError(result.error ?? 'Не удалось создать район.');
        return;
      }

      router.push('/dashboard/districts');
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/districts">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Новый район</h1>
          <p className="mt-1 text-gray-500">Заполните данные о районе и добавьте фотографии.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>Название обязательно, описание и фото можно добавить сразу.</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="cityId">Город</Label>
              <Select name="cityId" value={cityId} onValueChange={setCityId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите город" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Название района</Label>
              <Input id="name" name="name" placeholder="Центральный" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Input id="description" name="description" placeholder="Краткое описание района" />
            </div>

            <PhotoUploader label="Фотографии района" maxPhotos={3} onChange={setPhotos} />

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Создать район'
                )}
              </Button>

              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/districts">Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
