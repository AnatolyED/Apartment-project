CREATE TABLE IF NOT EXISTS "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "districts" ADD COLUMN IF NOT EXISTS "city_id" uuid;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "districts" WHERE "city_id" IS NULL) THEN
    ALTER TABLE "districts" ALTER COLUMN "city_id" SET NOT NULL;
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "districts"
    ADD CONSTRAINT "districts_city_id_cities_id_fk"
    FOREIGN KEY ("city_id")
    REFERENCES "public"."cities"("id")
    ON DELETE no action
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
