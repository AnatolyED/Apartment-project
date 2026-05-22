/**
 * API Route: получение района по ID.
 * GET /api/districts/{id}
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBotApiToken } from '@/lib/api/bot-auth';
import { findDistrictById } from '@/lib/districts/queries';

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
    isActive: district.isActive,
    createdAt: district.createdAt,
    updatedAt: district.updatedAt,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<unknown> }
) {
  try {
    const unauthorized = requireBotApiToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { id } = (await context.params) as { id: string };
    const compact = request.nextUrl.searchParams.get('view') === 'bot';
    const district = await findDistrictById(id);

    if (!district) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'District not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        districts: [
          mapDistrictForApi(
            district as unknown as Record<string, unknown>,
            compact
          ),
        ],
        total: 1,
      },
    });
  } catch (error) {
    console.error('API District by ID error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to get district',
        },
      },
      { status: 500 }
    );
  }
}
