/**
 * Hook для получения списка районов
 * Используется в формах создания/редактирования
 */

'use client';

import { useEffect, useState } from 'react';
import { getDistrictsAction } from '@/lib/districts/actions';
import type { District } from '@/lib/db/schema';

export function useDistricts() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDistricts() {
      try {
        const result = await getDistrictsAction();
        if (result.success && result.districts) {
          setDistricts(result.districts);
        }
      } catch (error) {
        console.error('Failed to load districts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDistricts();
  }, []);

  return { districts, loading };
}
