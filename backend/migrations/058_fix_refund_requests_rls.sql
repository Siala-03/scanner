-- Migration 058: Fix RLS on minimart_refund_requests
-- The original policies used `restaurant_id = current_tenant_id()` which blocks
-- all operations when the staff JWT does not carry a restaurant_id claim
-- (current_tenant_id() returns NULL → NULL comparison is never true).
-- Fix: allow the operation when tenant ID is NULL (app-level auth applies),
-- and enforce strict isolation only when the claim IS present.

DROP POLICY IF EXISTS "minimart_refund_requests_insert" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_select" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_update" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_all"    ON minimart_refund_requests;

CREATE POLICY "minimart_refund_requests_all"
  ON minimart_refund_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    current_tenant_id() IS NULL
    OR restaurant_id = current_tenant_id()
    OR current_is_superadmin()
  )
  WITH CHECK (
    current_tenant_id() IS NULL
    OR restaurant_id = current_tenant_id()
    OR current_is_superadmin()
  );
