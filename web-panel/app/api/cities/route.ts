/**
 * API Route: Получение списка городов
 * GET /api/cities
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCitiesAction } from '@/lib/cities/actions';

function mapCityForApi(city: Record<string, unknown>, compact: boolean) {
  if (!compact) {
    return city;
  }

  return {
    id: city.id,
    name: city.name,
    description: city.description,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const compact = searchParams.get('view') === 'bot';
    const limitValue = searchParams.get('limit');
    const isActiveValue = searchParams.get('isActive');

    const result = await getCitiesAction({
      limit: limitValue ? parseInt(limitValue, 10) : undefined,
      isActive: isActiveValue ? isActiveValue === 'true' : undefined,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        cities: (result.cities || []).map((city) =>
          mapCityForApi(city as unknown as Record<string, unknown>, compact)
        ),
        total: result.total || 0
      }
    });
  } catch (error) {
    console.error('API Cities error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Не удалось получить города'
      }
    }, { status: 500 });
  }
}
