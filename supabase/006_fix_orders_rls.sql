-- ============================================
-- FIX: ORDERS TABLE RLS POLICIES
-- Migration 004 enabled RLS on orders but only allowed anon INSERT
-- for online orders. This blocked all regular table orders and all
-- staff operations since the app uses custom auth (anon role only).
-- ============================================

BEGIN;

-- Drop all restrictive policies added in 004
DROP POLICY IF EXISTS "Anonymous can create online orders" ON orders;
DROP POLICY IF EXISTS "Authenticated staff can view their restaurant's orders" ON orders;
DROP POLICY IF EXISTS "Authenticated staff can update their restaurant's orders" ON orders;

-- Allow anon to do everything on orders
-- (restaurant_id scoping is enforced at the application layer)
CREATE POLICY "App can manage orders"
  ON orders
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMIT;
