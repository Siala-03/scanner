-- ============================================
-- FIX: ONLINE QR CODES RLS POLICIES
-- The app uses a custom staff_credentials login, not Supabase Auth.
-- All browser requests arrive as the 'anon' role.
-- Replace JWT-metadata policies with anon-friendly ones.
-- ============================================

BEGIN;

-- Drop ALL existing policies on online_qr_codes
DROP POLICY IF EXISTS "Anonymous can view active QR codes by token" ON online_qr_codes;
DROP POLICY IF EXISTS "Authenticated staff can view own restaurant QR codes" ON online_qr_codes;
DROP POLICY IF EXISTS "Authenticated staff can manage own restaurant QR codes" ON online_qr_codes;
DROP POLICY IF EXISTS "Authenticated users can insert QR codes" ON online_qr_codes;
DROP POLICY IF EXISTS "Authenticated users can view QR codes" ON online_qr_codes;
DROP POLICY IF EXISTS "Authenticated users can update QR codes" ON online_qr_codes;

-- Allow anon to do everything on online_qr_codes
-- (access control is enforced at the app layer via restaurant_id filters)
CREATE POLICY "App can manage QR codes"
  ON online_qr_codes
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMIT;
