-- Migration 063: Restore permissive write policies on restaurants table
-- Migration 046 replaced the permissive INSERT/UPDATE/DELETE policies from
-- migration 042 with TO authenticated + current_is_superadmin() checks.
-- The Supabase client uses the anon key and custom JWTs from the staff-login
-- edge function are not parsed as authenticated sessions by PostgREST, so
-- TO authenticated policies never match and superadmin writes are blocked.
-- Fix: restore USING(true)/WITH CHECK(true) for writes; keep read policies.

DROP POLICY IF EXISTS "restaurants_superadmin_insert" ON restaurants;
DROP POLICY IF EXISTS "restaurants_superadmin_update" ON restaurants;
DROP POLICY IF EXISTS "restaurants_superadmin_delete" ON restaurants;
DROP POLICY IF EXISTS "Allow insert restaurants"      ON restaurants;
DROP POLICY IF EXISTS "Allow update restaurants"      ON restaurants;
DROP POLICY IF EXISTS "Allow delete restaurants"      ON restaurants;
DROP POLICY IF EXISTS "Allow all restaurants"         ON restaurants;

CREATE POLICY "restaurants_insert"
  ON restaurants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "restaurants_update"
  ON restaurants FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "restaurants_delete"
  ON restaurants FOR DELETE
  USING (true);
