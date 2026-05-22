DO $$
BEGIN
  CREATE TYPE "public"."finishing" AS ENUM('Чистовая', 'Вайт бокс', 'Без отделки');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"photos" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "apartments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"finishing" "public"."finishing" NOT NULL,
	"rooms" varchar(50) NOT NULL,
	"area" real NOT NULL,
	"floor" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"photos" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "apartments"
    ADD CONSTRAINT "apartments_district_id_districts_id_fk"
    FOREIGN KEY ("district_id")
    REFERENCES "public"."districts"("id")
    ON DELETE no action
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
