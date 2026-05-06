-- Migration 060: Fix minimart_refunds.restaurant_id type and RLS
-- restaurant_id was UUID but all restaurant IDs in this schema are TEXT.
-- Also fix RLS: client uses anon key so TO authenticated never matches.

-- 1. Drop policy that references restaurant_id BEFORE altering the column type
DROP POLICY IF EXISTS "tenant_isolation"      ON minimart_refunds;
DROP POLICY IF EXISTS "minimart_refunds_all"  ON minimart_refunds;

-- 2. Drop the index before altering the column type
DROP INDEX IF EXISTS idx_minimart_refunds_restaurant;

-- 3. Change restaurant_id from UUID to TEXT
ALTER TABLE minimart_refunds
  ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text;

-- 4. Recreate index for TEXT type
CREATE INDEX IF NOT EXISTS idx_minimart_refunds_restaurant
  ON minimart_refunds (restaurant_id);

-- 5. Create permissive policy (app enforces tenant isolation via restaurant_id filter)
CREATE POLICY "minimart_refunds_all"
  ON minimart_refunds
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);
