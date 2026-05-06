-- Migration 064: Fix minimart_settings.restaurant_id type to TEXT
-- minimart_settings was created with restaurant_id UUID in migration 053,
-- but this project uses TEXT restaurant IDs (e.g. GCTQ30).
-- This mismatch causes: invalid input syntax for type uuid.

-- 1. Drop policies that may reference restaurant_id casting
DROP POLICY IF EXISTS "tenant_isolation" ON minimart_settings;
DROP POLICY IF EXISTS "minimart_settings_all" ON minimart_settings;

-- 2. Convert PK column from UUID -> TEXT
ALTER TABLE minimart_settings
  ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text;

-- 3. Recreate permissive policy (app scopes by explicit restaurant_id filter)
CREATE POLICY "minimart_settings_all"
  ON minimart_settings
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);
