-- Создаём таблицу cities
CREATE TABLE IF NOT EXISTS "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Создаём дефолтный город если его нет
INSERT INTO "cities" ("id", "name", "description", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Город по умолчанию', '', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "cities");

-- Добавляем колонку city_id с дефолтным значением (первый город)
ALTER TABLE "districts" ADD COLUMN IF NOT EXISTS "city_id" uuid DEFAULT (SELECT id FROM "cities" LIMIT 1);

-- Обновляем все существующие районы на первый город
UPDATE "districts" SET "city_id" = (SELECT id FROM "cities" LIMIT 1) WHERE "city_id" IS NULL;

-- Делаем поле NOT NULL
ALTER TABLE "districts" ALTER COLUMN "city_id" SET NOT NULL;

-- Убираем дефолтное значение
ALTER TABLE "districts" ALTER COLUMN "city_id" DROP DEFAULT;

-- Добавляем внешний ключ
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_cities_id_fk" 
FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
