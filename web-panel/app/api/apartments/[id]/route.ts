/**
 * API Route: Получение квартиры по ID
 * GET /api/apartments/{id}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApartmentByIdAction } from '@/lib/apartments/actions';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const compact = request.nextUrl.searchParams.get('view') === 'bot';
    const result = await getApartmentByIdAction(id);

    if (!result.success || !result.apartment) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Квартира не найдена'
        }
      }, { status: 404 });
    }

    // Возвращаем квартиру в формате data.apartments[0] для совместимости с ботом
    return NextResponse.json({
      success: true,
      data: {
        apartments: [
          mapApartmentForApi(
            result.apartment as unknown as Record<string, unknown>,
            compact
          ),
        ]
      }
    });
  } catch (error) {
    console.error('API Apartment by ID error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Не удалось получить квартиру'
      }
    }, { status: 500 });
  }
}
