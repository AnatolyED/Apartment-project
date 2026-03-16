/**
 * Server Actions для сущности Apartment (Квартира)
 * CRUD операции с поддержкой Soft Delete, загрузки фото и пагинации
 */

'use server';

import { z } from 'zod';
import { eq, and, desc, asc, count, gte, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { apartments, districts, type Apartment, type NewApartment } from '@/lib/db/schema';
import {
  createApartmentSchema,
  updateApartmentSchema,
} from '@/lib/validators';
import {
  getEntityDir,
  saveFileToEntityDir,
  deleteFile,
  deleteEntityDir,
  validateFile,
  generateUniqueFileName,
} from '@/lib/storage';
import { assertRole } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/actions';

// ============================================
// Типы результатов
// ============================================

interface ApartmentResult {
  success: boolean;
  apartment?: Apartment;
  error?: string;
}

interface ApartmentsListResult {
  success: boolean;
  apartments?: Apartment[];
  total?: number;
  totalPages?: number;
  currentPage?: number;
  error?: string;
}

// ============================================
// Параметры запроса списка
// ============================================

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

type ApartmentWhereCondition = ReturnType<typeof eq>;

function buildApartmentWhereConditions(
  params: {
    districtId?: string;
    finishing?: string;
    rooms?: string;
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
  }
): ApartmentWhereCondition[] {
  const conditions: ApartmentWhereCondition[] = [eq(apartments.isActive, true)];

  if (params.districtId) {
    conditions.push(eq(apartments.districtId, params.districtId));
  }

  if (params.finishing) {
    conditions.push(eq(apartments.finishing, params.finishing as NewApartment['finishing']));
  }

  if (params.rooms) {
    conditions.push(eq(apartments.rooms, params.rooms));
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

// ============================================
// CREATE: Создание новой квартиры
// ============================================

/**
 * Создание новой квартиры с загрузкой фотографий
 * 
 * Логика работы с файлами:
 * 1. Валидация данных формы через Zod
 * 2. Вставка записи в БД (получаем новый ID)
 * 3. Создание директории public/uploads/apartments/{id}/
 * 4. Сохранение фотографий в созданную директорию
 * 5. Обновление записи в БД с путями к фото
 */
export async function createApartmentAction(
  formData: FormData
): Promise<ApartmentResult> {
  const uploadedPhotoPaths: string[] = [];
  let createdApartmentId: string | null = null;
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Парсинг и валидация данных формы
    // ============================================
    const rawData = Object.fromEntries(formData.entries());

    // Обработка массива фотографий
    const photosRaw = rawData.photos;
    delete rawData.photos;

    // Обработка числовых полей (price, area, floor)
    const validatedData = createApartmentSchema.parse({
      ...rawData,
      photos: photosRaw
        ? Array.isArray(photosRaw)
          ? photosRaw
          : [photosRaw]
        : [],
    });

    // ============================================
    // Шаг 2: Создание записи в БД (без фото)
    // ============================================
    const insertData: NewApartment = {
      districtId: validatedData.districtId,
      name: validatedData.name,
      finishing: validatedData.finishing,
      rooms: validatedData.rooms,
      area: validatedData.area,
      floor: validatedData.floor,
      price: validatedData.price.toString(),
      photos: [],
      isActive: true,
    };

    const inserted = await db
      .insert(apartments)
      .values(insertData)
      .returning();

    const newApartment = inserted[0];
    createdApartmentId = newApartment?.id ?? null;

    if (!newApartment) {
      throw new Error('Не удалось создать квартиру');
    }

    // ============================================
    // Шаг 3: Обработка загруженных файлов
    // ============================================
    const photoFiles = formData.getAll('photoFiles') as File[];
    const photoPaths: string[] = [...validatedData.photos];

    if (photoFiles && photoFiles.length > 0) {
      // ============================================
      // КРИТИЧЕСКИ ВАЖНО: Создание директории
      // public/uploads/apartments/{apartmentId}/
      // ============================================
      const entityDir = await getEntityDir({
        entityType: 'apartments',
        entityId: newApartment.id,
      });

      for (const file of photoFiles) {
        const validation = await validateFile(file);
        if (!validation.valid) {
          // Откат: удаляем созданную запись при ошибке
          await db.delete(apartments).where(eq(apartments.id, newApartment.id));
          return {
            success: false,
            error: validation.error,
          };
        }

        const fileName = generateUniqueFileName(file.name);
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const relativePath = await saveFileToEntityDir(
          entityDir,
          buffer,
          fileName
        );

        uploadedPhotoPaths.push(relativePath);
        photoPaths.push(relativePath);
      }
    }

    // ============================================
    // Шаг 4: Обновление записи с путями к фото
    // ============================================
    if (photoPaths.length > 0) {
      await db
        .update(apartments)
        .set({ photos: photoPaths })
        .where(eq(apartments.id, newApartment.id));

      newApartment.photos = photoPaths;
    }

    // ============================================
    // Шаг 5: Очистка кэша
    // ============================================
    revalidatePath('/dashboard/apartments');
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'apartment.created',
      entityType: 'apartment',
      entityId: newApartment.id,
      entityLabel: newApartment.name,
    });

    return {
      success: true,
      apartment: newApartment,
    };
  } catch (error) {
    await Promise.all(uploadedPhotoPaths.map((path) => deleteFile(path)));

    if (createdApartmentId) {
      await db.delete(apartments).where(eq(apartments.id, createdApartmentId));
    }

    console.error('Create apartment error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при создании квартиры',
    };
  }
}

// ============================================
// READ: Получение списка квартир с фильтрацией и пагинацией
// ============================================

/**
 * Получение списка квартир с поддержкой:
 * - Пагинации (server-side)
 * - Сортировки по различным полям
 * - Фильтрации по параметрам
 * 
 * Все параметры берутся из searchParams URL
 */
export async function getApartmentsAction(
  params: ApartmentsQueryParams = {}
): Promise<ApartmentsListResult> {
  try {
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

    // Фильтруем 'all' и 'any' значения
    const filteredCityId = cityId && cityId !== 'all' ? cityId : undefined;
    const filteredDistrictId = districtId && districtId !== 'all' ? districtId : undefined;
    const filteredFinishing = finishing && finishing !== 'any' ? finishing : undefined;
    const filteredRooms = rooms && rooms !== 'any' ? rooms : undefined;

    // ============================================
    // Шаг 1: Построение условий WHERE
    // ============================================
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

    // ============================================
    // Шаг 2: Получение общего количества записей
    // ============================================
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

    // ============================================
    // Шаг 3: Построение сортировки
    // ============================================
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

    // ============================================
    // Шаг 4: Получение данных с пагинацией
    // ============================================
    const offset = (page - 1) * limit;

    let result;

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

      result = apartmentsWithDistrict.map(r => r.apartment);
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
      success: true,
      apartments: result,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
      currentPage: page,
    };
  } catch (error) {
    console.error('Get apartments error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить список квартир',
    };
  }
}

/**
 * Получение одной квартиры по ID
 */
export async function getApartmentByIdAction(
  id: string
): Promise<ApartmentResult> {
  try {
    const result = await db
      .select()
      .from(apartments)
      .where(and(eq(apartments.id, id), eq(apartments.isActive, true)))
      .limit(1);

    const apartment = result[0];

    if (!apartment) {
      return {
        success: false,
        error: 'Квартира не найдена',
      };
    }

    return {
      success: true,
      apartment,
    };
  } catch (error) {
    console.error('Get apartment by ID error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить квартиру',
    };
  }
}

// ============================================
// UPDATE: Обновление квартиры
// ============================================

/**
 * Обновление данных квартиры
 * Поддерживает добавление новых фото и удаление старых
 */
export async function updateApartmentAction(
  id: string,
  formData: FormData
): Promise<ApartmentResult> {
  const uploadedPhotoPaths: string[] = [];
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Получение существующей квартиры
    // ============================================
    const existing = await getApartmentByIdAction(id);
    if (!existing.apartment) {
      return { success: false, error: 'Квартира не найдена' };
    }

    // ============================================
    // Шаг 2: Парсинг и валидация данных
    // ============================================
    const rawData = Object.fromEntries(formData.entries());

    // Обработка URL удалённых фото (физическое удаление файлов)
    const deletedPhotoUrls = formData.getAll('deletedPhotoUrls') as string[];
    
    // Удаляем файлы с диска
    delete rawData.photos;
    delete rawData.deletedPhotoUrls;

    const validatedData = updateApartmentSchema.parse(rawData);

    // ============================================
    // Шаг 3: Формирование нового массива фото
    // ============================================
    const currentPhotos = formData.getAll('currentPhotos') as string[];
    const photoPaths = [...currentPhotos];

    // ============================================
    // Шаг 4: Обработка новых файлов
    // ============================================
    const photoFiles = formData.getAll('photoFiles') as File[];

    if (photoFiles && photoFiles.length > 0) {
      for (const file of photoFiles) {
        const validation = await validateFile(file);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }
      }

      const entityDir = await getEntityDir({
        entityType: 'apartments',
        entityId: id,
      });

      for (const file of photoFiles) {
        const fileName = generateUniqueFileName(file.name);
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const relativePath = await saveFileToEntityDir(
          entityDir,
          buffer,
          fileName
        );

        uploadedPhotoPaths.push(relativePath);
        photoPaths.push(relativePath);
      }
    }

    // ============================================
    // Шаг 5: Обновление записи в БД
    // ============================================
    const updateData: Record<string, unknown> = {
      photos: photoPaths.length > 0 ? photoPaths : null,
      updatedAt: new Date(),
    };

    // Добавляем только определённые поля
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.districtId !== undefined) updateData.districtId = validatedData.districtId;
    if (validatedData.finishing !== undefined) updateData.finishing = validatedData.finishing;
    if (validatedData.rooms !== undefined) updateData.rooms = validatedData.rooms;
    if (validatedData.area !== undefined) updateData.area = validatedData.area;
    if (validatedData.floor !== undefined) updateData.floor = validatedData.floor;
    if (validatedData.price !== undefined) updateData.price = validatedData.price.toString();

    const updated = await db
      .update(apartments)
      .set(updateData)
      .where(eq(apartments.id, id))
      .returning();

    for (const url of deletedPhotoUrls) {
      await deleteFile(url);
    }

    revalidatePath('/dashboard/apartments');
    if (updated[0]) {
      await writeAuditLog({
        actorUserId: currentSession.userId,
        actorLogin: currentSession.login,
        actorRole: currentSession.role,
        action: 'apartment.updated',
        entityType: 'apartment',
        entityId: updated[0].id,
        entityLabel: updated[0].name,
      });
    }

    return {
      success: true,
      apartment: updated[0],
    };
  } catch (error) {
    await Promise.all(uploadedPhotoPaths.map((path) => deleteFile(path)));
    console.error('Update apartment error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при обновлении квартиры',
    };
  }
}

// ============================================
// DELETE: Мягкое удаление квартиры (Soft Delete)
// ============================================

/**
 * Мягкое удаление квартиры
 *
 * Важно: Запись скрывается (is_active = false).
 * Файлы удаляются с диска для освобождения места.
 */
export async function deleteApartmentAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Получение квартиры для удаления фото
    // ============================================
    const existing = await getApartmentByIdAction(id);
    
    if (existing.apartment?.photos) {
      // ============================================
      // Шаг 2: Физическое удаление файлов
      // ============================================
      for (const photoUrl of existing.apartment.photos) {
        await deleteFile(photoUrl);
      }
      
      // Очищаем директорию квартиры
      const entityDir = await getEntityDir({
        entityType: 'apartments',
        entityId: id,
      });
      await deleteEntityDir(entityDir);
    }

    // ============================================
    // Шаг 3: Обновление флага is_active (Soft Delete)
    // ============================================
    await db
      .update(apartments)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(apartments.id, id));

    // ============================================
    // Шаг 4: Очистка кэша
    // ============================================
    revalidatePath('/dashboard/apartments');
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'apartment.deleted',
      entityType: 'apartment',
      entityId: id,
      entityLabel: existing.apartment?.name ?? null,
    });

    return { success: true };
  } catch (error) {
    console.error('Delete apartment error:', error);
    return {
      success: false,
      error: 'Произошла ошибка при удалении квартиры',
    };
  }
}
