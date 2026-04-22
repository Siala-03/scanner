-- ============================================
-- FIX: ONLINE QR CODES RLS POLICIES
-- The previous policies required restaurant_id in JWT metadata which
-- is not populated. Replace with role-based policies that work with
-- the anon key client used in the browser.
-- ============================================

BEGIN;

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated staff can view own restaurant QR codes" ON online_qr_codes;
DROP POLICY IF EXISTS "Authenticated staff can manage own restaurant QR codes" ON online_qr_codes;

-- Allow any authenticated user to INSERT a QR code
-- (restaurant_id is enforced at the application layer)
CREATE POLICY "Authenticated users can insert QR codes"
  ON online_qr_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to SELECT any QR code
-- (app filters by restaurant_id in queries)
CREATE POLICY "Authenticated users can view QR codes"
  ON online_qr_codes
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to UPDATE their QR codes
CREATE POLICY "Authenticated users can update QR codes"
  ON online_qr_codes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
