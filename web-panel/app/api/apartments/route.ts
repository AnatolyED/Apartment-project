/**
 * API Route: Получение списка квартир
 * GET /api/apartments?districtId={id}&cityId={id}&page={n}&limit={n}
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBotApiToken } from '@/lib/api/bot-auth';
import { FINISHING_TYPES } from '@/lib/validators';
import { listApartments } from '@/lib/apartments/queries';

const apartmentQuerySchema = z.object({
  cityId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum([
      'created_desc',
      'created_asc',
      'price_desc',
      'price_asc',
      'area_desc',
      'area_asc',
      'floor_desc',
      'floor_asc',
      'rooms_desc',
      'rooms_asc',
      'finishing_desc',
      'finishing_asc',
      'name_desc',
      'name_asc',
    ])
    .optional(),
  finishing: z
    .enum(FINISHING_TYPES)
    .optional(),
  rooms: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
      z.string().regex(/^(?:\d\+?|\u0441\u0442\u0443\u0434\u0438\u044f)$/).optional()
    ),
  priceMin: z.coerce.number().min(0).max(1_000_000_000).optional(),
  priceMax: z.coerce.number().min(0).max(1_000_000_000).optional(),
  areaMin: z.coerce.number().min(0).max(1000).optional(),
  areaMax: z.coerce.number().min(0).max(1000).optional(),
});

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
    isActive: apartment.isActive,
    createdAt: apartment.createdAt,
    updatedAt: apartment.updatedAt,
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
    
    const parsedFilters = apartmentQuerySchema.safeParse({
      cityId: searchParams.get('cityId') || undefined,
      districtId: searchParams.get('districtId') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      sort: searchParams.get('sort') || undefined,
      finishing: searchParams.get('finishing') || undefined,
      rooms: searchParams.get('rooms') || undefined,
      priceMin: searchParams.get('priceMin') || undefined,
      priceMax: searchParams.get('priceMax') || undefined,
      areaMin: searchParams.get('areaMin') || undefined,
      areaMax: searchParams.get('areaMax') || undefined,
    });

    if (!parsedFilters.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: parsedFilters.error.issues.map((issue) => issue.message),
          },
        },
        { status: 400 }
      );
    }

    const result = await listApartments(parsedFilters.data);
    
    return NextResponse.json({
      success: true,
      data: {
        apartments: result.apartments.map((apartment) =>
          mapApartmentForApi(apartment as unknown as Record<string, unknown>, compact)
        ),
        total: result.total,
        totalPages: result.totalPages,
        currentPage: result.currentPage
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
