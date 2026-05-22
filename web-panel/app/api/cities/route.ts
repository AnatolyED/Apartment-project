/**
 * API Route: Получение списка городов
 * GET /api/cities
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBotApiToken } from '@/lib/api/bot-auth';
import { listCities } from '@/lib/cities/queries';

function mapCityForApi(city: Record<string, unknown>, compact: boolean) {
  if (!compact) {
    return city;
  }

  return {
    id: city.id,
    name: city.name,
    description: city.description,
    isActive: city.isActive,
    createdAt: city.createdAt,
    updatedAt: city.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireBotApiToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const searchParams = request.nextUrl.searchParams;
    const compact = searchParams.get('view') === 'bot';
    const limitValue = searchParams.get('limit');
    const isActiveValue = searchParams.get('isActive');

    const result = await listCities({
      limit: limitValue ? parseInt(limitValue, 10) : undefined,
      isActive: isActiveValue ? isActiveValue === 'true' : undefined,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        cities: result.cities.map((city) =>
          mapCityForApi(city as unknown as Record<string, unknown>, compact)
        ),
        total: result.total
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
