-- Migration 042: RLS policies for restaurants table
-- The app uses custom staff auth (not Supabase Auth), so policies must
-- allow write operations from the anon key for superadmin operations.
-- Application-level auth guards these routes; DB-level RLS stays permissive
-- to avoid blocking legitimate superadmin inserts/updates.

-- Drop any conflicting policies first
DROP POLICY IF EXISTS "Allow insert restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow update restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow delete restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow all restaurants" ON restaurants;

-- Allow INSERT (superadmin creating a new outlet)
CREATE POLICY "Allow insert restaurants"
  ON restaurants
  FOR INSERT
  WITH CHECK (true);

-- Allow UPDATE (superadmin editing outlet details / outlet_type)
CREATE POLICY "Allow update restaurants"
  ON restaurants
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow DELETE (superadmin removing an outlet)
CREATE POLICY "Allow delete restaurants"
  ON restaurants
  FOR DELETE
  USING (true);
