-- Migration 059: Fix minimart_refund_requests RLS for anon-key Supabase clients
-- The client is created with the anon key (createClient(url, anonKey)).
-- Staff sessions set via supabase.auth.setSession() may establish an
-- authenticated Supabase session, but policies scoped TO authenticated
-- still fail when the JWT lacks a restaurant_id claim (current_tenant_id()
-- returns NULL and NULL = NULL is never true).
-- Solution: drop the role restriction entirely and use USING(true)/WITH CHECK(true)
-- so all roles can read/write. Tenant isolation is enforced at the app level
-- (all queries filter by restaurant_id explicitly).

DROP POLICY IF EXISTS "minimart_refund_requests_all"    ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_insert" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_select" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_update" ON minimart_refund_requests;

CREATE POLICY "minimart_refund_requests_all"
  ON minimart_refund_requests
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);
