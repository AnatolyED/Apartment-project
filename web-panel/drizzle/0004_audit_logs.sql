CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "actor_login" varchar(100) NOT NULL,
  "actor_role" "public"."user_role" NOT NULL,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(100) NOT NULL,
  "entity_id" varchar(100),
  "entity_label" text,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk"
    FOREIGN KEY ("actor_user_id")
    REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
