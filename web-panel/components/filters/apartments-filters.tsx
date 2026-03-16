/**
 * Компонент фильтров для страницы квартир
 * Две строки: (Город, Район, Отделка, Комнаты) и (Цена, Площадь)
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
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
import { Filter } from 'lucide-react';
import { FINISHING_TYPES } from '@/lib/validators';
import { getCitiesAction } from '@/lib/cities/actions';
import type { getDistrictsAction } from '@/lib/districts/actions';

// ============================================
// Константы
// ============================================

const ROOM_OPTIONS = ['1', '1+', '2', '2+', '3', '3+', '4+', 'студия'];

// ============================================
// Типы
// ============================================

interface FiltersProps {
  districts: Awaited<ReturnType<typeof getDistrictsAction>>;
  cities: Awaited<ReturnType<typeof getCitiesAction>>;
  initialFilters?: {
    cityId?: string;
    districtId?: string;
    finishing?: string;
    rooms?: string;
    priceMin?: string;
    priceMax?: string;
    areaMin?: string;
    areaMax?: string;
  };
}

// ============================================
// Вспомогательные функции
// ============================================

function getStringParam(
  searchParams: { [key: string]: string | string[] | undefined },
  param: string
): string {
  const value = searchParams[param];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

// ============================================
// Компонент фильтров
// ============================================

export function ApartmentsFilters({ districts, cities, initialFilters = {} }: FiltersProps) {
  const router = useRouter();
  
  // Инициализируем state значениями из URL
  const [selectedCity, setSelectedCity] = useState(initialFilters.cityId || 'all');
  const [selectedDistrict, setSelectedDistrict] = useState(initialFilters.districtId || 'all');
  const [selectedFinishing, setSelectedFinishing] = useState(initialFilters.finishing || 'any');
  const [selectedRooms, setSelectedRooms] = useState(initialFilters.rooms || 'any');
  const [priceMin, setPriceMin] = useState(initialFilters.priceMin || '');
  const [priceMax, setPriceMax] = useState(initialFilters.priceMax || '');
  const [areaMin, setAreaMin] = useState(initialFilters.areaMin || '');
  const [areaMax, setAreaMax] = useState(initialFilters.areaMax || '');
  
  // Фильтрация районов по выбранному городу
  const filteredDistricts = selectedCity && selectedCity !== 'all'
    ? districts.districts?.filter(d => d.cityId === selectedCity)
    : districts.districts;
  
  // Сбрасываем выбранный район, если он не входит в выбранный город
  useEffect(() => {
    if (selectedCity && selectedCity !== 'all' && selectedDistrict && selectedDistrict !== 'all') {
      const districtInCity = filteredDistricts?.some(d => d.id === selectedDistrict);
      if (!districtInCity) {
        setSelectedDistrict('all');
      }
    }
  }, [selectedCity, filteredDistricts, selectedDistrict]);

  // Проверка: есть ли активные фильтры
  const hasActiveFilters =
    selectedCity !== 'all' ||
    selectedDistrict !== 'all' ||
    selectedFinishing !== 'any' ||
    selectedRooms !== 'any' ||
    priceMin ||
    priceMax ||
    areaMin ||
    areaMax;

  // Обработка отправки формы
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Собираем только непустые параметры
    const params = new URLSearchParams();
    if (selectedCity && selectedCity !== 'all') params.set('cityId', selectedCity);
    if (selectedDistrict && selectedDistrict !== 'all') params.set('districtId', selectedDistrict);
    if (selectedFinishing && selectedFinishing !== 'any') params.set('finishing', selectedFinishing);
    if (selectedRooms && selectedRooms !== 'any') params.set('rooms', selectedRooms);
    if (priceMin) params.set('priceMin', priceMin);
    if (priceMax) params.set('priceMax', priceMax);
    if (areaMin) params.set('areaMin', areaMin);
    if (areaMax) params.set('areaMax', areaMax);

    // Переходим на страницу с параметрами через полную перезагрузку
    const queryString = params.toString();
    const newPath = queryString
      ? `/dashboard/apartments?${queryString}`
      : '/dashboard/apartments';

    window.location.href = newPath;
  };

  // Сброс фильтров
  const handleReset = () => {
    setSelectedCity('all');
    setSelectedDistrict('all');
    setSelectedFinishing('any');
    setSelectedRooms('any');
    setPriceMin('');
    setPriceMax('');
    setAreaMin('');
    setAreaMax('');
    window.location.href = '/dashboard/apartments';
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Заголовок */}
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-500" />
            <span className="font-medium">Фильтры</span>
          </div>

          {/* Строка 1: Город, Район, Отделка, Комнаты */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Город */}
            <div className="space-y-2">
              <Label htmlFor="cityId">Город</Label>
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Все города" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все города</SelectItem>
                  {cities.cities?.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Район */}
            <div className="space-y-2">
              <Label htmlFor="districtId">Район</Label>
              <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={selectedCity && selectedCity !== 'all' ? 'Все районы города' : 'Все районы'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {selectedCity && selectedCity !== 'all' ? 'Все районы города' : 'Все районы'}
                  </SelectItem>
                  {filteredDistricts?.map((district) => (
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
              <Select value={selectedFinishing} onValueChange={setSelectedFinishing}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Любая" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Любая</SelectItem>
                  {FINISHING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Комнаты */}
            <div className="space-y-2">
              <Label htmlFor="rooms">Комнаты</Label>
              <Select value={selectedRooms} onValueChange={setSelectedRooms}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Любые" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Любые</SelectItem>
                  {ROOM_OPTIONS.map((rooms) => (
                    <SelectItem key={rooms} value={rooms}>
                      {rooms}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Строка 2: Цена и Площадь */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Цена */}
            <div className="space-y-2">
              <Label>Цена (₽)</Label>
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    type="number"
                    placeholder="От"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    type="number"
                    placeholder="До"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Площадь */}
            <div className="space-y-2">
              <Label>Площадь (м²)</Label>
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    type="number"
                    placeholder="От"
                    value={areaMin}
                    onChange={(e) => setAreaMin(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    type="number"
                    placeholder="До"
                    value={areaMax}
                    onChange={(e) => setAreaMax(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Кнопка применения */}
          <div className="flex items-center gap-2 pt-4 border-t">
            <Button type="submit" size="sm">
              Применить
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              Сбросить
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
