import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { districts, type District } from '@/lib/db/schema';

export interface DistrictsQueryParams {
  cityId?: string;
}

export interface DistrictsQueryResult {
  districts: District[];
  total: number;
}

export async function listDistricts(
  params: DistrictsQueryParams = {}
): Promise<DistrictsQueryResult> {
  const conditions = [eq(districts.isActive, true)];

  if (params.cityId) {
    conditions.push(eq(districts.cityId, params.cityId));
  }

  const result = await db
    .select()
    .from(districts)
    .where(and(...conditions))
    .orderBy(desc(districts.createdAt));

  return {
    districts: result,
    total: result.length,
  };
}

export async function findDistrictById(id: string): Promise<District | null> {
  const [district] = await db
    .select()
    .from(districts)
    .where(and(eq(districts.id, id), eq(districts.isActive, true)))
    .limit(1);

  return district ?? null;
}
