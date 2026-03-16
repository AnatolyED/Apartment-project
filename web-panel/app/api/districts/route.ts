/**
 * API Route: Получение списка районов
 * GET /api/districts?cityId={id}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDistrictsAction } from '@/lib/districts/actions';

function mapDistrictForApi(district: Record<string, unknown>, compact: boolean) {
  if (!compact) {
    return district;
  }

  return {
    id: district.id,
    cityId: district.cityId,
    name: district.name,
    description: district.description,
    photos: district.photos,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cityId = searchParams.get('cityId');
    const compact = searchParams.get('view') === 'bot';
    
    const result = await getDistrictsAction({
      cityId: cityId || undefined,
    });
    const districts = result.districts || [];
    
    return NextResponse.json({
      success: true,
      data: {
        districts: districts.map((district) =>
          mapDistrictForApi(
            district as unknown as Record<string, unknown>,
            compact
          )
        ),
        total: districts.length
      }
    });
  } catch (error) {
    console.error('API Districts error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Не удалось получить районы'
      }
    }, { status: 500 });
  }
}
