import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cities, type City } from '@/lib/db/schema';

export interface CitiesQueryParams {
  isActive?: boolean;
  limit?: number;
}

export interface CitiesQueryResult {
  cities: City[];
  total: number;
}

export async function listCities(params: CitiesQueryParams = {}): Promise<CitiesQueryResult> {
  const conditions = [];
  const limit = params.limit && params.limit > 0 ? params.limit : undefined;

  if (params.isActive !== undefined) {
    conditions.push(eq(cities.isActive, params.isActive));
  } else {
    conditions.push(eq(cities.isActive, true));
  }

  const query = db
    .select()
    .from(cities)
    .where(and(...conditions))
    .orderBy(desc(cities.createdAt));

  const result = limit ? await query.limit(limit) : await query;

  return {
    cities: result,
    total: result.length,
  };
}

export async function findCityById(id: string): Promise<City | null> {
  const [city] = await db
    .select()
    .from(cities)
    .where(and(eq(cities.id, id), eq(cities.isActive, true)))
    .limit(1);

  return city ?? null;
}
