DO $$ BEGIN
 CREATE TYPE "apartment_import_mode" AS ENUM ('rules', 'hybrid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "apartment_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "actor_login" varchar(100) NOT NULL,
  "actor_role" "user_role" NOT NULL,
  "file_name" text NOT NULL,
  "file_hash" varchar(64),
  "mode" "apartment_import_mode" DEFAULT 'rules' NOT NULL,
  "parser_provider" varchar(100) DEFAULT 'rules' NOT NULL,
  "status" varchar(32) NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "submitted_rows" integer DEFAULT 0 NOT NULL,
  "imported_rows" integer DEFAULT 0 NOT NULL,
  "duplicate_rows" integer DEFAULT 0 NOT NULL,
  "error_rows" integer DEFAULT 0 NOT NULL,
  "warning_rows" integer DEFAULT 0 NOT NULL,
  "created_cities" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_districts" text[] DEFAULT '{}'::text[] NOT NULL,
  "summary" jsonb,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "apartment_import_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL,
  "source_row_id" varchar(100) NOT NULL,
  "row_number" integer,
  "source_page" integer,
  "source_id" varchar(100),
  "apartment_id" uuid,
  "name" text NOT NULL,
  "city_name" text,
  "district_name" text,
  "status" varchar(32) NOT NULL,
  "message" text,
  "warnings" jsonb,
  "errors" jsonb,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "apartment_import_batches" ADD CONSTRAINT "apartment_import_batches_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "apartment_import_rows" ADD CONSTRAINT "apartment_import_rows_batch_id_apartment_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."apartment_import_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "apartment_import_rows" ADD CONSTRAINT "apartment_import_rows_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "apartment_import_batches_created_at_idx"
  ON "apartment_import_batches" ("created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "apartment_import_batches_file_hash_idx"
  ON "apartment_import_batches" ("file_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "apartment_import_rows_batch_idx"
  ON "apartment_import_rows" ("batch_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "apartment_import_rows_apartment_idx"
  ON "apartment_import_rows" ("apartment_id");
