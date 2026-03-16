/**
 * Подключение к базе данных PostgreSQL через Drizzle ORM
 * Используется драйвер postgres (node-postgres)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Проверка наличия переменной окружения
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL не указана в .env');
}

// Создание подключения к PostgreSQL с обработкой ошибок
let client: ReturnType<typeof postgres>;

try {
  client = postgres(process.env.DATABASE_URL, {
    // Максимальное количество соединений в пуле
    max: 10,
    // Таймаут подключения в секундах
    connect_timeout: 10,
  });
} catch (error) {
  console.error('Failed to create PostgreSQL client:', error);
  throw new Error('Не удалось подключиться к базе данных');
}

// Инициализация Drizzle ORM с переданным клиентом и схемой
export const db = drizzle(client, { schema });

// Экспорт типов для использования в приложении
export type { InferSelectModel } from 'drizzle-orm';
