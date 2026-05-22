/**
 * Server Actions для сущности Apartment (Квартира)
 * CRUD операции с поддержкой Soft Delete, загрузки фото и пагинации
 */

'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { apartments, type Apartment, type NewApartment } from '@/lib/db/schema';
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
import {
  findApartmentById,
  listApartments,
  type ApartmentsQueryParams,
} from '@/lib/apartments/queries';

export type { ApartmentsQueryParams } from '@/lib/apartments/queries';

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
    await assertRole(['admin', 'moderator']);
    const result = await listApartments(params);

    return {
      success: true,
      apartments: result.apartments,
      total: result.total,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
    };
  } catch (error) {
    console.error('Get apartments error:', error);
    return {
      success: false,
      error: '?? ??????? ????????? ?????? ???????',
    };
  }
}

export async function getApartmentByIdAction(
  id: string
): Promise<ApartmentResult> {
  try {
    await assertRole(['admin', 'moderator']);
    const apartment = await findApartmentById(id);

    if (!apartment) {
      return {
        success: false,
        error: '???????? ?? ???????',
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
      error: '?? ??????? ????????? ????????',
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
    // Удаляем файлы с диска
    delete rawData.photos;
    delete rawData.deletedPhotoUrls;

    const validatedData = updateApartmentSchema.parse(rawData);

    // ============================================
    // Шаг 3: Формирование нового массива фото
    // ============================================
    const existingPhotos = existing.apartment.photos ?? [];
    const existingPhotoSet = new Set(existingPhotos);
    const currentPhotos = (formData.getAll('currentPhotos') as string[]).filter((path) =>
      existingPhotoSet.has(path)
    );
    const deletedPhotoUrls = (formData.getAll('deletedPhotoUrls') as string[]).filter((path) =>
      existingPhotoSet.has(path)
    );
    const deletedPhotoSet = new Set(deletedPhotoUrls);
    const photoPaths = currentPhotos.filter((path) => !deletedPhotoSet.has(path));

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
