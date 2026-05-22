ALTER TABLE "apartment_import_batches"
  ADD COLUMN IF NOT EXISTS "rollback_status" varchar(32) DEFAULT 'not_started' NOT NULL,
  ADD COLUMN IF NOT EXISTS "rolled_back_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "rolled_back_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "rolled_back_by_login" varchar(100),
  ADD COLUMN IF NOT EXISTS "rollback_details" jsonb;
--> statement-breakpoint

ALTER TABLE "apartment_import_rows"
  ADD COLUMN IF NOT EXISTS "rollback_status" varchar(32) DEFAULT 'not_started' NOT NULL,
  ADD COLUMN IF NOT EXISTS "rolled_back_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "rollback_message" text;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "apartment_import_batches" ADD CONSTRAINT "apartment_import_batches_rolled_back_by_user_id_users_id_fk" FOREIGN KEY ("rolled_back_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "apartment_import_batches_rollback_status_idx"
  ON "apartment_import_batches" ("rollback_status");
