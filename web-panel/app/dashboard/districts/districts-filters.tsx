/**
 * Компонент фильтра городов для страницы районов
 * Client Component для работы с useRouter
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter } from 'lucide-react';
import type { getCitiesAction } from '@/lib/cities/actions';

interface DistrictsFiltersProps {
  cities: Awaited<ReturnType<typeof getCitiesAction>>;
  initialCityId?: string;
}

export function DistrictsFilters({ cities, initialCityId }: DistrictsFiltersProps) {
  const router = useRouter();
  const [selectedCity, setSelectedCity] = useState(initialCityId || 'all');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (selectedCity && selectedCity !== 'all') {
      window.location.href = `/dashboard/districts?cityId=${selectedCity}`;
    } else {
      window.location.href = '/dashboard/districts';
    }
  };

  const handleReset = () => {
    setSelectedCity('all');
    window.location.href = '/dashboard/districts';
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Filter className="w-5 h-5 text-gray-500" />
          <Label htmlFor="cityId" className="whitespace-nowrap">Город:</Label>
          <Select value={selectedCity} onValueChange={setSelectedCity}>
            <SelectTrigger className="w-64">
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
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">Применить</Button>
          <Button type="button" variant="outline" size="sm" onClick={handleReset}>
            Сбросить
          </Button>
        </div>
      </div>
    </form>
  );
}
