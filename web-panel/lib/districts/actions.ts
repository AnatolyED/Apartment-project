/**
 * Server Actions для сущности District (Район)
 * CRUD операции с поддержкой Soft Delete и загрузки фото
 */

'use server';

import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { apartments, districts, type District, type NewDistrict } from '@/lib/db/schema';
import {
  createDistrictSchema,
  updateDistrictSchema,
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

interface DistrictResult {
  success: boolean;
  district?: District;
  error?: string;
}

interface DistrictsListResult {
  success: boolean;
  districts?: District[];
  total?: number;
  error?: string;
}

interface DistrictsQueryParams {
  cityId?: string;
}

// ============================================
// CREATE: Создание нового района
// ============================================

/**
 * Создание нового района с загрузкой фотографий
 * 
 * Логика работы с файлами:
 * 1. Валидация данных формы через Zod
 * 2. Вставка записи в БД (получаем новый ID)
 * 3. Создание директории public/uploads/districts/{id}/
 * 4. Сохранение фотографий в созданную директорию
 * 5. Обновление записи в БД с путями к фото
 */
export async function createDistrictAction(
  formData: FormData
): Promise<DistrictResult> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Парсинг и валидация данных формы
    // ============================================
    const rawData = Object.fromEntries(formData.entries());
    
    // Обработка массива фотографий (может быть строкой или string[])
    const photosRaw = rawData.photos;
    delete rawData.photos;
    
    const validatedData = createDistrictSchema.parse({
      ...rawData,
      photos: photosRaw
        ? Array.isArray(photosRaw)
          ? photosRaw
          : [photosRaw]
        : [],
    });

    // ============================================
    // Шаг 2: Создание записи в БД (без фото)
    // Получаем новый UUID для района
    // ============================================
    const insertData: NewDistrict = {
      cityId: validatedData.cityId,
      name: validatedData.name,
      description: validatedData.description || null,
      photos: [],
      isActive: true,
    };

    const inserted = await db
      .insert(districts)
      .values(insertData)
      .returning();

    const newDistrict = inserted[0];

    if (!newDistrict) {
      throw new Error('Не удалось создать район');
    }

    // ============================================
    // Шаг 3: Обработка загруженных файлов
    // Если есть файлы для загрузки, сохраняем их
    // ============================================
    const photoFiles = formData.getAll('photoFiles') as File[];
    const photoPaths: string[] = [...validatedData.photos];

    if (photoFiles && photoFiles.length > 0) {
      // ============================================
      // КРИТИЧЕСКИ ВАЖНО: Создание директории
      // getEntityDir автоматически создаёт структуру:
      // public/uploads/districts/{districtId}/
      // ============================================
      const entityDir = await getEntityDir({
        entityType: 'districts',
        entityId: newDistrict.id,
      });

      // Сохранение каждого файла
      for (const file of photoFiles) {
        // Валидация файла
        const validation = await validateFile(file);
        if (!validation.valid) {
          // Откат: удаляем созданную запись при ошибке валидации
          await db.delete(districts).where(eq(districts.id, newDistrict.id));
          return {
            success: false,
            error: validation.error,
          };
        }

        // Генерация уникального имени
        const fileName = generateUniqueFileName(file.name);

        // Чтение файла в Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // ============================================
        // Сохранение файла на диск через fs/promises
        // ============================================
        const relativePath = await saveFileToEntityDir(
          entityDir,
          buffer,
          fileName
        );

        photoPaths.push(relativePath);
      }
    }

    // ============================================
    // Шаг 4: Обновление записи с путями к фото
    // ============================================
    if (photoPaths.length > 0) {
      await db
        .update(districts)
        .set({ photos: photoPaths })
        .where(eq(districts.id, newDistrict.id));

      newDistrict.photos = photoPaths;
    }

    // ============================================
    // Шаг 5: Очистка кэша
    // revalidatePath обновляет кэш для страниц списка
    // ============================================
    revalidatePath('/dashboard/districts');
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'district.created',
      entityType: 'district',
      entityId: newDistrict.id,
      entityLabel: newDistrict.name,
    });

    return {
      success: true,
      district: newDistrict,
    };
  } catch (error) {
    console.error('Create district error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при создании района',
    };
  }
}

// ============================================
// READ: Получение списка районов
// ============================================

/**
 * Получение списка активных районов
 * Сортировка по дате создания (новые первыми)
 */
export async function getDistrictsAction(
  params: DistrictsQueryParams = {}
): Promise<DistrictsListResult> {
  try {
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
      success: true,
      districts: result,
      total: result.length,
    };
  } catch (error) {
    console.error('Get districts error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить список районов',
    };
  }
}

/**
 * Получение одного района по ID
 */
export async function getDistrictByIdAction(
  id: string
): Promise<DistrictResult> {
  try {
    const result = await db
      .select()
      .from(districts)
      .where(and(eq(districts.id, id), eq(districts.isActive, true)))
      .limit(1);

    const district = result[0];

    if (!district) {
      return {
        success: false,
        error: 'Район не найден',
      };
    }

    return {
      success: true,
      district,
    };
  } catch (error) {
    console.error('Get district by ID error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить район',
    };
  }
}

// ============================================
// UPDATE: Обновление района
// ============================================

/**
 * Обновление данных района
 * Поддерживает добавление новых фото и удаление старых
 */
export async function updateDistrictAction(
  id: string,
  formData: FormData
): Promise<DistrictResult> {
  const uploadedPhotoPaths: string[] = [];
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    // ============================================
    // Шаг 1: Получение существующего района
    // ============================================
    const existing = await getDistrictByIdAction(id);
    if (!existing.district) {
      return { success: false, error: 'Район не найден' };
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

    const validatedData = updateDistrictSchema.parse(rawData);

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
        entityType: 'districts',
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
    const updateData: Partial<NewDistrict> = {
      ...validatedData,
      photos: photoPaths.length > 0 ? photoPaths : null,
      updatedAt: new Date(),
    };

    const updated = await db
      .update(districts)
      .set(updateData)
      .where(eq(districts.id, id))
      .returning();

    for (const url of deletedPhotoUrls) {
      await deleteFile(url);
    }

    revalidatePath('/dashboard/districts');
    if (updated[0]) {
      await writeAuditLog({
        actorUserId: currentSession.userId,
        actorLogin: currentSession.login,
        actorRole: currentSession.role,
        action: 'district.updated',
        entityType: 'district',
        entityId: updated[0].id,
        entityLabel: updated[0].name,
      });
    }

    return {
      success: true,
      district: updated[0],
    };
  } catch (error) {
    await Promise.all(uploadedPhotoPaths.map((path) => deleteFile(path)));
    console.error('Update district error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при обновлении района',
    };
  }
}

// ============================================
// DELETE: Мягкое удаление района (Soft Delete)
// ============================================

/**
 * Мягкое удаление района
 *
 * Важно: Запись скрывается (is_active = false).
 * Файлы удаляются с диска для освобождения места.
 */
export async function deleteDistrictAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentSession = await assertRole(['admin', 'moderator']);

    const districtResult = await db
      .select()
      .from(districts)
      .where(eq(districts.id, id))
      .limit(1);

    const district = districtResult[0];
    if (!district) {
      return {
        success: false,
        error: 'Район не найден',
      };
    }

    const districtApartments = await db
      .select()
      .from(apartments)
      .where(eq(apartments.districtId, id));

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
        .where(eq(apartments.districtId, id));
    }

    if (district.photos) {
      for (const photoUrl of district.photos) {
        await deleteFile(photoUrl);
      }
    }

    const districtDir = await getEntityDir({
      entityType: 'districts',
      entityId: id,
    });
    await deleteEntityDir(districtDir);

    await db
      .update(districts)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(districts.id, id));

    // ============================================
    // Шаг 4: Очистка кэша
    // ============================================
    revalidatePath('/dashboard/districts');
    revalidatePath('/dashboard/apartments');
    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'district.deleted',
      entityType: 'district',
      entityId: district.id,
      entityLabel: district.name,
      details: {
        apartmentsAffected: districtApartments.length,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Delete district error:', error);
    return {
      success: false,
      error: 'Произошла ошибка при удалении района',
    };
  }
}
