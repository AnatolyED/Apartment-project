CREATE UNIQUE INDEX IF NOT EXISTS "cities_active_name_unique_idx"
  ON "cities" (lower("name"))
  WHERE "is_active" = true;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "districts_active_city_name_unique_idx"
  ON "districts" ("city_id", lower("name"))
  WHERE "is_active" = true;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "apartments_active_district_lookup_idx"
  ON "apartments" ("district_id", "is_active");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "apartments_active_import_dedupe_idx"
  ON "apartments" ("district_id", lower("name"), "area", "floor", "price")
  WHERE "is_active" = true;
