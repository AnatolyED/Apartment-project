DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type type_record
    JOIN pg_namespace namespace_record ON namespace_record.oid = type_record.typnamespace
    WHERE type_record.typname = 'finishing'
      AND namespace_record.nspname = 'public'
  ) AND EXISTS (
    SELECT 1
    FROM pg_enum enum_record
    JOIN pg_type type_record ON type_record.oid = enum_record.enumtypid
    WHERE type_record.typname = 'finishing'
      AND enum_record.enumlabel = 'Р§РёСЃС‚РѕРІР°СЏ'
  ) THEN
    CREATE TYPE "public"."finishing_utf8" AS ENUM('Чистовая', 'Вайт бокс', 'Без отделки');

    IF to_regclass('public.apartments') IS NOT NULL THEN
      ALTER TABLE "apartments"
        ALTER COLUMN "finishing" TYPE "public"."finishing_utf8"
        USING (
          CASE "finishing"::text
            WHEN 'Р§РёСЃС‚РѕРІР°СЏ' THEN 'Чистовая'
            WHEN 'Р’Р°Р№С‚ Р±РѕРєСЃ' THEN 'Вайт бокс'
            WHEN 'Р‘РµР· РѕС‚РґРµР»РєРё' THEN 'Без отделки'
            ELSE "finishing"::text
          END
        )::"public"."finishing_utf8";
    END IF;

    DROP TYPE "public"."finishing";
    ALTER TYPE "public"."finishing_utf8" RENAME TO "finishing";
  END IF;
END
$$;
