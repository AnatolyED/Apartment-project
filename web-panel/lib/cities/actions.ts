/**
 * Server Actions для сущности City (Город)
 * CRUD операции с поддержкой Soft Delete
 */

'use server';

import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { apartments, cities, districts, type City, type NewCity } from '@/lib/db/schema';
import {
  createCitySchema,
  updateCitySchema,
} from '@/lib/validators';
import {
  deleteEntityDir,
  deleteFile,
  getEntityDir,
} from '@/lib/storage';
import { assertRole } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/actions';

// ============================================
// Типы результатов
// ============================================

interface CityResult {
  success: boolean;
  city?: City;
  error?: string;
}

interface CitiesListResult {
  success: boolean;
  cities?: City[];
  total?: number;
  error?: string;
}

interface CitiesQueryParams {
  isActive?: boolean;
  limit?: number;
}

// ============================================
// CREATE: Создание нового города
// ============================================

export async function createCityAction(
  formData: FormData
): Promise<CityResult> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Парсинг и валидация данных формы
    // ============================================
    const rawData = Object.fromEntries(formData.entries());
    const validatedData = createCitySchema.parse(rawData);

    // ============================================
    // Шаг 2: Создание записи в БД
    // ============================================
    const insertData: NewCity = {
      name: validatedData.name,
      description: validatedData.description || null,
      isActive: true,
    };

    const inserted = await db
      .insert(cities)
      .values(insertData)
      .returning();

    const newCity = inserted[0];

    if (!newCity) {
      throw new Error('Не удалось создать город');
    }

    // ============================================
    // Шаг 3: Очистка кэша
    // ============================================
    revalidatePath('/dashboard/cities');
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'city.created',
      entityType: 'city',
      entityId: newCity.id,
      entityLabel: newCity.name,
    });

    return {
      success: true,
      city: newCity,
    };
  } catch (error) {
    console.error('Create city error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при создании города',
    };
  }
}

// ============================================
// READ: Получение списка городов
// ============================================

/**
 * Получение списка активных городов
 * Сортировка по дате создания (новые первыми)
 */
export async function getCitiesAction(
  params: CitiesQueryParams = {}
): Promise<CitiesListResult> {
  try {
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
      success: true,
      cities: result,
      total: result.length,
    };
  } catch (error) {
    console.error('Get cities error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить список городов',
    };
  }
}

/**
 * Получение одного города по ID
 */
export async function getCityByIdAction(
  id: string
): Promise<CityResult> {
  try {
    const result = await db
      .select()
      .from(cities)
      .where(and(eq(cities.id, id), eq(cities.isActive, true)))
      .limit(1);

    const city = result[0];

    if (!city) {
      return {
        success: false,
        error: 'Город не найден',
      };
    }

    return {
      success: true,
      city,
    };
  } catch (error) {
    console.error('Get city by ID error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить город',
    };
  }
}

// ============================================
// UPDATE: Обновление города
// ============================================

export async function updateCityAction(
  id: string,
  formData: FormData
): Promise<CityResult> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Получение существующего города
    // ============================================
    const existing = await getCityByIdAction(id);
    if (!existing.city) {
      return { success: false, error: 'Город не найден' };
    }

    // ============================================
    // Шаг 2: Парсинг и валидация данных
    // ============================================
    const rawData = Object.fromEntries(formData.entries());
    const validatedData = updateCitySchema.parse(rawData);

    // ============================================
    // Шаг 3: Обновление записи в БД
    // ============================================
    const updateData: Partial<NewCity> = {
      ...validatedData,
      updatedAt: new Date(),
    };

    const updated = await db
      .update(cities)
      .set(updateData)
      .where(eq(cities.id, id))
      .returning();

    revalidatePath('/dashboard/cities');
    if (updated[0]) {
      await writeAuditLog({
        actorUserId: currentSession.userId,
        actorLogin: currentSession.login,
        actorRole: currentSession.role,
        action: 'city.updated',
        entityType: 'city',
        entityId: updated[0].id,
        entityLabel: updated[0].name,
      });
    }

    return {
      success: true,
      city: updated[0],
    };
  } catch (error) {
    console.error('Update city error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при обновлении города',
    };
  }
}

// ============================================
// DELETE: Мягкое удаление города (Soft Delete)
// ============================================

/**
 * Мягкое удаление города
 * Запись скрывается (is_active = false).
 */
export async function deleteCityAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    const cityResult = await db
      .select()
      .from(cities)
      .where(eq(cities.id, id))
      .limit(1);

    const city = cityResult[0];
    if (!city) {
      return {
        success: false,
        error: 'Город не найден',
      };
    }

    const cityDistricts = await db
      .select()
      .from(districts)
      .where(eq(districts.cityId, id));

    const districtIds = cityDistricts.map((district) => district.id);

    if (districtIds.length > 0) {
      const districtApartments = await db
        .select()
        .from(apartments)
        .where(inArray(apartments.districtId, districtIds));

      for (const apartment of districtApartments) {
        if (apartment.photos) {
          for (const photoUrl of apartment.photos) {
            await deleteFile(photoUrl);
          }
        }

        const apartmentDir = await getEntityDir({
          entityType: 'apartments',
          entityId: apartment.id,
        });
        await deleteEntityDir(apartmentDir);
      }

      if (districtApartments.length > 0) {
        await db
          .update(apartments)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(inArray(apartments.districtId, districtIds));
      }

      for (const district of cityDistricts) {
        if (district.photos) {
          for (const photoUrl of district.photos) {
            await deleteFile(photoUrl);
          }
        }

        const districtDir = await getEntityDir({
          entityType: 'districts',
          entityId: district.id,
        });
        await deleteEntityDir(districtDir);
      }

      await db
        .update(districts)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(districts.cityId, id));
    }

    await db
      .update(cities)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(cities.id, id));

    revalidatePath('/dashboard/cities');
    revalidatePath('/dashboard/districts');
    revalidatePath('/dashboard/apartments');
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'city.deleted',
      entityType: 'city',
      entityId: city.id,
      entityLabel: city.name,
      details: {
        districtsAffected: districtIds.length,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Delete city error:', error);
    return {
      success: false,
      error: 'Произошла ошибка при удалении города',
    };
  }
}
