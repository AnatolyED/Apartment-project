/**
 * Компонент фильтров квартир (Client Component)
 * С динамической фильтрацией районов по городу
 */

'use client';

import { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FINISHING_OPTIONS } from '@/lib/validators';

interface ApartmentsFiltersFormProps {
  cities: Array<{ id: string; name: string }>;
  districts: Array<{ id: string; name: string; cityId: string }>;
  currentParams: {
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

const ROOM_OPTIONS = ['1', '1+', '2', '2+', '3', '3+', '4+', 'студия'];

export function ApartmentsFiltersForm({
  cities,
  districts,
  currentParams,
}: ApartmentsFiltersFormProps) {
  const [selectedCity, setSelectedCity] = useState(currentParams.cityId || 'all');
  const [filteredDistricts, setFilteredDistricts] = useState(
    selectedCity && selectedCity !== 'all'
      ? districts.filter((d) => d.cityId === selectedCity)
      : districts
  );

  // Обновляем список районов при изменении города
  useEffect(() => {
    if (selectedCity && selectedCity !== 'all') {
      setFilteredDistricts(districts.filter((d) => d.cityId === selectedCity));
    } else {
      setFilteredDistricts(districts);
    }
  }, [selectedCity, districts]);

  const hasActiveFilters =
    (currentParams.cityId && currentParams.cityId !== 'all') ||
    (currentParams.districtId && currentParams.districtId !== 'all') ||
    (currentParams.finishing && currentParams.finishing !== 'any') ||
    (currentParams.rooms && currentParams.rooms !== 'any') ||
    currentParams.priceMin ||
    currentParams.priceMax ||
    currentParams.areaMin ||
    currentParams.areaMax;

  return (
    <form
      ref={(form) => {
        // Сохраняем ссылку на форму для доступа к элементам
      }}
      className="space-y-4 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        const params = new URLSearchParams();

        const cityId = formData.get('cityId') as string;
        const districtId = formData.get('districtId') as string;
        const finishing = formData.get('finishing') as string;
        const rooms = formData.get('rooms') as string;
        const priceMin = formData.get('priceMin') as string;
        const priceMax = formData.get('priceMax') as string;
        const areaMin = formData.get('areaMin') as string;
        const areaMax = formData.get('areaMax') as string;

        if (cityId && cityId !== 'all') params.set('cityId', cityId);
        if (districtId && districtId !== 'all') params.set('districtId', districtId);
        if (finishing && finishing !== 'any') params.set('finishing', finishing);
        if (rooms && rooms !== 'any') params.set('rooms', rooms);
        if (priceMin) params.set('priceMin', priceMin);
        if (priceMax) params.set('priceMax', priceMax);
        if (areaMin) params.set('areaMin', areaMin);
        if (areaMax) params.set('areaMax', areaMax);

        window.location.href = `/dashboard/apartments?${params.toString()}`;
      }}
      onChange={(e) => {
        const form = e.currentTarget;
        // Обработка изменения города для динамической фильтрации районов
        if (e.target instanceof HTMLSelectElement && e.target.name === 'cityId') {
          setSelectedCity(e.target.value);
        }
        // Обработка изменения района - автоматически выставляем город
        if (e.target instanceof HTMLSelectElement && e.target.name === 'districtId') {
          const selectedDistrictId = e.target.value;
          if (selectedDistrictId && selectedDistrictId !== 'all') {
            const selectedDistrict = districts.find((d) => d.id === selectedDistrictId);
            if (selectedDistrict?.cityId) {
              setSelectedCity(selectedDistrict.cityId);
              // Находим select города и устанавливаем значение
              const citySelect = form.querySelector('select[name="cityId"]') as HTMLSelectElement;
              if (citySelect) {
                citySelect.value = selectedDistrict.cityId;
              }
            }
          }
        }
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Filter className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-gray-800">Фильтры поиска</span>
        {hasActiveFilters && (
          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
            Активные фильтры
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Город */}
        <div className="space-y-2">
          <Label htmlFor="cityId" className="text-sm font-medium">Город</Label>
          <select
            name="cityId"
            defaultValue={currentParams.cityId || 'all'}
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="all">Все города</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        {/* Район */}
        <div className="space-y-2">
          <Label htmlFor="districtId" className="text-sm font-medium">Район</Label>
          <select
            name="districtId"
            defaultValue={currentParams.districtId || 'all'}
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="all">Все районы</option>
            {filteredDistricts.map((district) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </select>
        </div>

        {/* Отделка */}
        <div className="space-y-2">
          <Label htmlFor="finishing" className="text-sm font-medium">Отделка</Label>
          <select
            name="finishing"
            defaultValue={currentParams.finishing || 'any'}
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="any">Любая</option>
            {FINISHING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Комнаты */}
        <div className="space-y-2">
          <Label htmlFor="rooms" className="text-sm font-medium">Количество комнат</Label>
          <select
            name="rooms"
            defaultValue={currentParams.rooms || 'any'}
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="any">Любое</option>
            {ROOM_OPTIONS.map((rooms) => (
              <option key={rooms} value={rooms}>
                {rooms}
              </option>
            ))}
          </select>
        </div>

        {/* Цена */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Цена (₽)</Label>
          <div className="flex gap-2">
            <input
              name="priceMin"
              type="number"
              placeholder="От"
              defaultValue={currentParams.priceMin}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <input
              name="priceMax"
              type="number"
              placeholder="До"
              defaultValue={currentParams.priceMax}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        </div>

        {/* Площадь */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Площадь (м²)</Label>
          <div className="flex gap-2">
            <input
              name="areaMin"
              type="number"
              placeholder="От"
              defaultValue={currentParams.areaMin}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <input
              name="areaMax"
              type="number"
              placeholder="До"
              defaultValue={currentParams.areaMax}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Кнопки */}
      <div className="flex items-center gap-2 pt-4 border-t border-blue-200">
        <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          Применить
        </Button>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = '/dashboard/apartments';
            }}
            className="flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Сбросить
          </Button>
        )}
      </div>
    </form>
  );
}
