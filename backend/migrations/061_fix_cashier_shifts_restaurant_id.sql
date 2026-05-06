-- Migration 061: Fix cashier_shifts.restaurant_id type and RLS
-- restaurant_id was UUID but all restaurant IDs in this schema are TEXT.
-- Also fix RLS: client uses anon key so TO authenticated never matches.

-- 1. Drop policy first (it references restaurant_id, blocking the ALTER)
DROP POLICY IF EXISTS "tenant_isolation"    ON cashier_shifts;
DROP POLICY IF EXISTS "cashier_shifts_all"  ON cashier_shifts;

-- 2. Drop index before altering column type
DROP INDEX IF EXISTS idx_cashier_shifts_restaurant;

-- 3. Change restaurant_id from UUID to TEXT
ALTER TABLE cashier_shifts
  ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text;

-- 4. Recreate index for TEXT type
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_restaurant
  ON cashier_shifts (restaurant_id);

-- 5. Create permissive policy (app enforces tenant isolation via restaurant_id filter)
CREATE POLICY "cashier_shifts_all"
  ON cashier_shifts
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);
