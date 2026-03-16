'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { updateDistrictAction, getDistrictByIdAction } from '@/lib/districts/actions';
import { getCitiesAction } from '@/lib/cities/actions';
import type { District } from '@/lib/db/schema';
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

export default function EditDistrictPage() {
  const router = useRouter();
  const params = useParams();
  const districtId = params.id as string;
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [district, setDistrict] = useState<District | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [photos, setPhotos] = useState<(File | string)[]>([]);
  const [deletedPhotoUrls, setDeletedPhotoUrls] = useState<string[]>([]);
  const [cityId, setCityId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [districtResult, citiesResult] = await Promise.all([
          getDistrictByIdAction(districtId),
          getCitiesAction(),
        ]);

        if (!districtResult.success || !districtResult.district) {
          setError(districtResult.error ?? 'Район не найден.');
          setDistrict(null);
          return;
        }

        setDistrict(districtResult.district);
        setPhotos(districtResult.district.photos ?? []);
        setCityId(districtResult.district.cityId);

        if (citiesResult.success && citiesResult.cities) {
          setCities(citiesResult.cities);
        }
      } catch (loadError) {
        console.error('Failed to load district edit data:', loadError);
        setError('Не удалось загрузить данные района.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [districtId]);

  const existingPhotos = useMemo(
    () => photos.filter((photo): photo is string => typeof photo === 'string'),
    [photos]
  );

  const handleSubmit = (formData: FormData) => {
    setError(null);

    formData.set('cityId', cityId);

    photos.forEach((photo) => {
      if (photo instanceof File) {
        formData.append('photoFiles', photo);
      }
    });

    existingPhotos.forEach((photoUrl) => {
      if (!deletedPhotoUrls.includes(photoUrl)) {
        formData.append('currentPhotos', photoUrl);
      }
    });

    deletedPhotoUrls.forEach((photoUrl) => {
      formData.append('deletedPhotoUrls', photoUrl);
    });

    startTransition(async () => {
      const result = await updateDistrictAction(districtId, formData);

      if (!result.success) {
        setError(result.error ?? 'Не удалось сохранить изменения района.');
        return;
      }

      router.push('/dashboard/districts');
      router.refresh();
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!district) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">{error ?? 'Район не найден.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/districts">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Редактирование района</h1>
          <p className="mt-1 text-gray-500">Измените информацию о районе и его фотографии.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>Обновите данные района и сохраните изменения.</CardDescription>
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
              <Input
                id="name"
                name="name"
                defaultValue={district.name}
                placeholder="Центральный"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Input
                id="description"
                name="description"
                defaultValue={district.description ?? ''}
                placeholder="Краткое описание района"
              />
            </div>

            <PhotoUploader
              label="Фотографии района"
              maxPhotos={3}
              existingPhotos={existingPhotos}
              onChange={setPhotos}
              onExistingPhotoDelete={(photoUrl) => {
                setDeletedPhotoUrls((prev) =>
                  prev.includes(photoUrl) ? prev : [...prev, photoUrl]
                );
              }}
            />

            {error && <div className="text-sm text-red-600">{error}</div>}

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
                <Link href="/dashboard/districts">Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
