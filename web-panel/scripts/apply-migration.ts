/**
 * Скрипт для применения миграции городов
 */

import postgres from 'postgres';

async function applyMigration() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не указана');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log('Создание таблицы cities...');
    await sql`
      CREATE TABLE IF NOT EXISTS "cities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;

    console.log('Создание или получение дефолтного города...');
    const cityResult = await sql`
      INSERT INTO "cities" ("name", "description", "is_active", "created_at", "updated_at")
      VALUES ('Город по умолчанию', '', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    let cityId: string;
    if (cityResult.length > 0) {
      cityId = cityResult[0].id;
      console.log('Создан новый город:', cityId);
    } else {
      const existing = await sql`SELECT id FROM "cities" LIMIT 1`;
      cityId = existing[0].id;
      console.log('Использован существующий город:', cityId);
    }

    console.log('Добавление колонки city_id в districts...');
    await sql.unsafe(`ALTER TABLE "districts" ADD COLUMN IF NOT EXISTS "city_id" uuid DEFAULT '${cityId}'`);

    console.log('Обновление существующих районов...');
    await sql.unsafe(`UPDATE "districts" SET "city_id" = '${cityId}' WHERE "city_id" IS NULL`);

    console.log('Установка NOT NULL...');
    await sql`ALTER TABLE "districts" ALTER COLUMN "city_id" SET NOT NULL`;

    console.log('Удаление DEFAULT...');
    await sql`ALTER TABLE "districts" ALTER COLUMN "city_id" DROP DEFAULT`;

    console.log('Добавление внешнего ключа...');
    await sql.unsafe(`ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action`);

    console.log('✅ Миграция успешно применена!');
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await sql.end();
  }
}

applyMigration();
