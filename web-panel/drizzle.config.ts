/**
 * Конфигурация Drizzle Kit для миграций базы данных
 * Используется для генерации SQL-миграций на основе schema.ts
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Путь к файлу схемы
  schema: './lib/db/schema.ts',

  // Папка для выходных миграций
  out: './drizzle',

  // Диалект PostgreSQL
  dialect: 'postgresql',

  // Настройки подключения к БД для применения миграций
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },

  // Включить строгий режим проверки
  strict: true,
});
