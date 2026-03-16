/**
 * API Route: Получение списка квартир
 * GET /api/apartments?districtId={id}&cityId={id}&page={n}&limit={n}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApartmentsAction } from '@/lib/apartments/actions';

function mapApartmentForApi(apartment: Record<string, unknown>, compact: boolean) {
  if (!compact) {
    return apartment;
  }

  return {
    id: apartment.id,
    districtId: apartment.districtId,
    name: apartment.name,
    finishing: apartment.finishing,
    rooms: apartment.rooms,
    area: apartment.area,
    floor: apartment.floor,
    price: apartment.price,
    photos: apartment.photos,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const compact = searchParams.get('view') === 'bot';
    
    const filters = {
      cityId: searchParams.get('cityId') || undefined,
      districtId: searchParams.get('districtId') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
      sort: searchParams.get('sort') || undefined,
      finishing: searchParams.get('finishing') || undefined,
      rooms: searchParams.get('rooms') || undefined,
      priceMin: searchParams.get('priceMin') ? parseFloat(searchParams.get('priceMin')!) : undefined,
      priceMax: searchParams.get('priceMax') ? parseFloat(searchParams.get('priceMax')!) : undefined,
      areaMin: searchParams.get('areaMin') ? parseFloat(searchParams.get('areaMin')!) : undefined,
      areaMax: searchParams.get('areaMax') ? parseFloat(searchParams.get('areaMax')!) : undefined,
    };

    const result = await getApartmentsAction(filters);
    
    return NextResponse.json({
      success: true,
      data: {
        apartments: (result.apartments || []).map((apartment) =>
          mapApartmentForApi(apartment as unknown as Record<string, unknown>, compact)
        ),
        total: result.total || 0,
        totalPages: result.totalPages || 0,
        currentPage: result.currentPage || 1
      }
    });
  } catch (error) {
    console.error('API Apartments error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Не удалось получить квартиры'
      }
    }, { status: 500 });
  }
}
