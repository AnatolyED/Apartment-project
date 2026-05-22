import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apartments, districts, type Apartment, type NewApartment } from '@/lib/db/schema';

export interface ApartmentsQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  cityId?: string;
  districtId?: string;
  finishing?: string;
  rooms?: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
}

export interface ApartmentsQueryResult {
  apartments: Apartment[];
  total: number;
  totalPages: number;
  currentPage: number;
}

type ApartmentWhereCondition = SQL<unknown>;

function normalizeRoomsFilter(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'any') {
    return undefined;
  }

  return trimmed.toLowerCase() === 'студия' ? 'Студия' : trimmed;
}

function buildApartmentWhereConditions(params: {
  districtId?: string;
  finishing?: string;
  rooms?: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
}): ApartmentWhereCondition[] {
  const conditions: ApartmentWhereCondition[] = [eq(apartments.isActive, true)];

  if (params.districtId) {
    conditions.push(eq(apartments.districtId, params.districtId));
  }

  if (params.finishing) {
    conditions.push(eq(apartments.finishing, params.finishing as NewApartment['finishing']));
  }

  if (params.rooms) {
    const plusMatch = params.rooms.match(/^(\d+)\+$/);

    if (plusMatch) {
      const minRooms = Number.parseInt(plusMatch[1], 10);
      conditions.push(
        sql<boolean>`CASE
          WHEN ${apartments.rooms} ~ '^[0-9]+$' THEN CAST(${apartments.rooms} AS integer) >= ${minRooms}
          ELSE false
        END`
      );
    } else {
      conditions.push(eq(apartments.rooms, params.rooms));
    }
  }

  if (params.priceMin !== undefined) {
    conditions.push(gte(apartments.price, params.priceMin.toString()));
  }

  if (params.priceMax !== undefined) {
    conditions.push(lte(apartments.price, params.priceMax.toString()));
  }

  if (params.areaMin !== undefined) {
    conditions.push(gte(apartments.area, params.areaMin));
  }

  if (params.areaMax !== undefined) {
    conditions.push(lte(apartments.area, params.areaMax));
  }

  return conditions;
}

export async function listApartments(
  params: ApartmentsQueryParams = {}
): Promise<ApartmentsQueryResult> {
  const {
    page = 1,
    limit = 20,
    sort = 'created_desc',
    cityId,
    districtId,
    finishing,
    rooms,
    priceMin,
    priceMax,
    areaMin,
    areaMax,
  } = params;

  const filteredCityId = cityId && cityId !== 'all' ? cityId : undefined;
  const filteredDistrictId = districtId && districtId !== 'all' ? districtId : undefined;
  const filteredFinishing = finishing && finishing !== 'any' ? finishing : undefined;
  const filteredRooms = normalizeRoomsFilter(rooms);

  const apartmentConditions = buildApartmentWhereConditions({
    districtId: filteredDistrictId,
    finishing: filteredFinishing,
    rooms: filteredRooms,
    priceMin,
    priceMax,
    areaMin,
    areaMax,
  });
  const hasJoinFilters =
    !!filteredCityId ||
    !!filteredDistrictId ||
    !!filteredFinishing ||
    !!filteredRooms ||
    priceMin !== undefined ||
    priceMax !== undefined ||
    areaMin !== undefined ||
    areaMax !== undefined;

  let total: number;

  if (hasJoinFilters) {
    const joinConditions = [...apartmentConditions];
    if (filteredCityId) {
      joinConditions.push(eq(districts.cityId, filteredCityId));
    }

    const countResult = await db
      .select({ count: count() })
      .from(apartments)
      .innerJoin(districts, eq(apartments.districtId, districts.id))
      .where(and(...joinConditions));
    total = countResult[0]?.count || 0;
  } else {
    const countResult = await db
      .select({ count: count() })
      .from(apartments)
      .where(and(...apartmentConditions));
    total = countResult[0]?.count || 0;
  }

  const [sortField, sortOrder] = sort.split('_');
  const orderFn = sortOrder === 'asc' ? asc : desc;

  let orderByExpr;
  switch (sortField) {
    case 'price':
      orderByExpr = orderFn(apartments.price);
      break;
    case 'area':
      orderByExpr = orderFn(apartments.area);
      break;
    case 'floor':
      orderByExpr = orderFn(apartments.floor);
      break;
    case 'rooms':
      orderByExpr = orderFn(apartments.rooms);
      break;
    case 'finishing':
      orderByExpr = orderFn(apartments.finishing);
      break;
    case 'name':
      orderByExpr = orderFn(apartments.name);
      break;
    case 'created':
    default:
      orderByExpr = orderFn(apartments.createdAt);
      break;
  }

  const offset = (page - 1) * limit;
  let result: Apartment[];

  if (hasJoinFilters) {
    const joinConditions = [...apartmentConditions];
    if (filteredCityId) {
      joinConditions.push(eq(districts.cityId, filteredCityId));
    }

    const apartmentsWithDistrict = await db
      .select({
        apartment: apartments,
      })
      .from(apartments)
      .innerJoin(districts, eq(apartments.districtId, districts.id))
      .where(and(...joinConditions))
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    result = apartmentsWithDistrict.map((row) => row.apartment);
  } else {
    result = await db
      .select()
      .from(apartments)
      .where(and(...apartmentConditions))
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);
  }

  return {
    apartments: result,
    total: Number(total),
    totalPages: Math.ceil(Number(total) / limit),
    currentPage: page,
  };
}

export async function findApartmentById(id: string): Promise<Apartment | null> {
  const [apartment] = await db
    .select()
    .from(apartments)
    .where(and(eq(apartments.id, id), eq(apartments.isActive, true)))
    .limit(1);

  return apartment ?? null;
}
