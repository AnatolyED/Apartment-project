/**
 * Утилиты для работы с локальным файловым хранилищем
 * 
 * ВАЖНО: Этот модуль использует Node.js fs/promises API для сохранения файлов
 * непосредственно на диск сервера. Файлы хранятся в структуре:
 * 
 * public/uploads/{entity_name}/{entity_id}/{filename}
 * 
 * где:
 * - entity_name: 'districts' или 'apartments'
 * - entity_id: UUID сущности (района или квартиры)
 * 
 * Эта структура обеспечивает:
 * 1. Изоляцию файлов разных сущностей
 * 2. Быстрый поиск файлов по ID
 * 3. Простое удаление при Soft Delete
 */

import { mkdir, writeFile, unlink, access, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import sharp from 'sharp';

// ============================================
// Константы и типы
// ============================================

// Базовая директория для загрузок (относительно корня проекта)
// process.cwd() возвращает абсолютный путь к рабочей директории Node.js
const UPLOADS_BASE_DIR = join(process.cwd(), 'public', 'uploads');

// Типы сущностей, для которых возможно сохранение файлов
export type EntityType = 'districts' | 'apartments';

// Максимальный размер файла в байтах (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const TELEGRAM_MAX_DIMENSION = 1280;
const TELEGRAM_JPEG_QUALITY = 75;

// Разрешённые MIME-типы изображений
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ============================================
// Интерфейсы
// ============================================

/**
 * Результат обработки загруженного файла
 */
export interface FileUploadResult {
  success: boolean;
  /** Относительный путь к файлу (для сохранения в БД) */
  filePath?: string;
  /** Ошибка, если загрузка не удалась */
  error?: string;
}

/**
 * Параметры для получения пути к директории сущности
 */
export interface GetEntityDirParams {
  entityType: EntityType;
  entityId: string;
}

// ============================================
// Основные функции
// ============================================

/**
 * Получение абсолютного пути к директории сущности
 * 
 * Эта функция создаёт полную структуру папок для хранения файлов сущности.
 * Пример возвращаемого пути:
 * /path/to/project/public/uploads/districts/550e8400-e29b-41d4-a716-446655440000/
 * 
 * @param params - Параметры сущности (тип и ID)
 * @returns Абсолютный путь к директории
 */
export async function getEntityDir(params: GetEntityDirParams): Promise<string> {
  const { entityType, entityId } = params;

  // Формирование полного пути к директории сущности
  // join() корректно обрабатывает разделители путей для текущей ОС
  const entityDir = join(UPLOADS_BASE_DIR, entityType, entityId);

  // ============================================
  // КРИТИЧЕСКИ ВАЖНО: Создание директории
  // 
  // mkdir с опцией { recursive: true } создаёт всю цепочку
  // родительских директорий, если они не существуют:
  // - public/uploads/ (если нет)
  // - public/uploads/districts/ (если нет)
  // - public/uploads/districts/{entityId}/ (целевая директория)
  //
  // Если директория уже существует — ошибка не возникает
  // ============================================
  await mkdir(entityDir, { recursive: true });

  return entityDir;
}

/**
 * Сохранение файла в директорию сущности
 * 
 * Эта функция принимает Buffer с данными файла и сохраняет его
 * в директорию, соответствующую сущности (район или квартира).
 * 
 * @param entityDir - Абсолютный путь к директории сущности (из getEntityDir)
 * @param fileData - Буфер с данными файла
 * @param fileName - Имя файла (с расширением)
 * @returns Относительный путь к сохранённому файлу
 * 
 * @example
 * // Пример использования в Server Action:
 * const entityDir = await getEntityDir({ entityType: 'apartments', entityId: 'uuid...' });
 * const formData = await request.formData();
 * const file = formData.get('photo') as File;
 * const arrayBuffer = await file.arrayBuffer();
 * const buffer = Buffer.from(arrayBuffer);
 * const relativePath = await saveFileToEntityDir(
 *   entityDir,
 *   buffer,
 *   `photo-${Date.now()}.jpg`
 * );
 * // relativePath = "/uploads/apartments/uuid.../photo-1234567890.jpg"
 */
export async function saveFileToEntityDir(
  entityDir: string,
  fileData: Buffer,
  fileName: string
): Promise<string> {
  // ============================================
  // Проверка размера файла
  // Защита от загрузки слишком больших файлов
  // ============================================
  if (fileData.length > MAX_FILE_SIZE) {
    throw new Error(
      `Размер файла превышает лимит ${MAX_FILE_SIZE / 1024 / 1024} MB`
    );
  }

  // ============================================
  // Формирование полного пути к файлу
  // join() гарантирует корректные разделители для ОС
  // ============================================
  const fullPath = join(entityDir, fileName);

  // ============================================
  // Запись файла на диск
  // writeFile создаёт файл по указанному пути
  // Если файл существует — он будет перезаписан
  // ============================================
  await writeFile(fullPath, fileData);
  await saveTelegramReadyVariant(fullPath, fileData, fileName);

  // ============================================
  // Возврат относительного пути
  // Этот путь сохраняется в базе данных
  //
  // Вычисляем относительный путь, удаляя префикс cwd + /public:
  // /path/to/project/public/uploads/... → /uploads/...
  //
  // ВАЖНО: В Next.js папка public — это корень для статических
  // файлов. Поэтому путь /uploads/... будет доступен по
  // http://localhost:3000/uploads/...
  // ============================================
  const publicDir = join(process.cwd(), 'public');
  let relativePath = fullPath.slice(publicDir.length);
  
  // Нормализуем слеши для Windows (заменяем \ на /)
  relativePath = relativePath.replace(/\\/g, '/');
  
  // Убеждаемся, что путь начинается с / и не имеет дублирующихся слешей
  relativePath = relativePath.replace(/\/+/g, '/');
  if (!relativePath.startsWith('/')) {
    relativePath = '/' + relativePath;
  }
  
  return relativePath;
}

function getTelegramReadyFileName(fileName: string): string {
  const fileNameWithoutExtension = fileName.replace(/\.[^.]+$/, '');
  return `${fileNameWithoutExtension}-telegram.jpg`;
}

async function saveTelegramReadyVariant(
  originalFullPath: string,
  fileData: Buffer,
  fileName: string
): Promise<void> {
  const telegramReadyFullPath = join(dirname(originalFullPath), getTelegramReadyFileName(fileName));

  try {
    const telegramBuffer = await sharp(fileData)
      .resize({
        width: TELEGRAM_MAX_DIMENSION,
        height: TELEGRAM_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: TELEGRAM_JPEG_QUALITY })
      .toBuffer();

    await writeFile(telegramReadyFullPath, telegramBuffer);
  } catch (error) {
    console.warn(`Не удалось подготовить Telegram-ready версию для ${originalFullPath}:`, error);
  }
}

/**
 * Удаление файла из хранилища
 *
 * Используется при Soft Delete сущности или при удалении
 * отдельных фотографий.
 *
 * @param relativePath - Относительный путь к файлу (как хранится в БД)
 */
export async function deleteFile(relativePath: string): Promise<void> {
  // Формирование полного пути к файлу
  // relativePath имеет вид /uploads/..., добавляем public/
  const fullPath = join(process.cwd(), 'public', relativePath);
  const telegramReadyPath = getTelegramReadyPath(fullPath);

  try {
    // Проверка существования файла перед удалением
    await access(fullPath);

    // Удаление файла
    await unlink(fullPath);

    console.log(`Файл удалён: ${fullPath}`);
  } catch (error) {
    // Файл не существует или ошибка доступа — это не критично
    // Логгируем для отладки, но не выбрасываем ошибку
    console.warn(`Не удалось удалить файл ${fullPath}:`, error);
  }

  if (telegramReadyPath) {
    try {
      await access(telegramReadyPath);
      await unlink(telegramReadyPath);
      console.log(`Telegram-ready файл удалён: ${telegramReadyPath}`);
    } catch {
    }
  }
}

/**
 * Удаление всей директории сущности
 * 
 * Вызывается при Soft Delete сущности (района или квартиры).
 * Физически удаляет все файлы сущности из хранилища.
 * 
 * @param entityDir - Абсолютный путь к директории сущности
 */
export async function deleteEntityDir(entityDir: string): Promise<void> {
  try {
    // Проверка существования директории
    await access(entityDir);

    // ============================================
    // Получение списка файлов в директории
    // readdir возвращает имена всех файлов
    // ============================================
    const files = await readdir(entityDir);

    // ============================================
    // Последовательное удаление каждого файла
    // Используем Promise.all для параллельного удаления
    // ============================================
    await Promise.all(
      files.map(async (fileName) => {
        const filePath = join(entityDir, fileName);
        await unlink(filePath);
      })
    );

    console.log(`Директория сущности очищена: ${entityDir}`);
  } catch (error) {
    // Директория не существует или ошибка доступа
    console.warn(`Не удалось очистить директорию ${entityDir}:`, error);
  }
}

/**
 * Валидация загруженного файла
 * 
 * Проверяет MIME-тип и размер файла перед сохранением.
 * 
 * @param file - Объект File из FormData
 * @returns Результат валидации
 */
export async function validateFile(file: File): Promise<{ valid: boolean; error?: string }> {
  // Проверка размера
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Размер файла превышает лимит ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    };
  }

  // Проверка MIME-типа
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Неподдерживаемый формат файла. Разрешены: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Генерация уникального имени файла
 * 
 * Создаёт имя файла с временной меткой и случайным суффиксом
 * для предотвращения коллизий.
 * 
 * @param originalName - Оригинальное имя файла
 * @returns Уникальное имя файла
 */
export function generateUniqueFileName(originalName: string): string {
  const ext = originalName.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `photo-${timestamp}-${random}.${ext}`;
}

function getTelegramReadyPath(fullPath: string): string | null {
  const extensionIndex = fullPath.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return null;
  }

  return `${fullPath.slice(0, extensionIndex)}-telegram.jpg`;
}
