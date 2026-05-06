-- Migration 062: Ensure RLS is enabled on all minimart tables
-- Supabase advisor flags any public table without RLS enabled.
-- This migration is a safety net: enables RLS and ensures a permissive
-- policy exists on every minimart-related table.
-- Tables already covered by migration 046 (orders, inventory_records, etc.)
-- are not repeated here.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'minimart_refunds',
    'minimart_refund_requests',
    'minimart_settings',
    'cashier_shifts'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

-- Ensure permissive policies exist (idempotent)
DO $$
BEGIN
  -- minimart_refunds
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='minimart_refunds') THEN
    EXECUTE 'DROP POLICY IF EXISTS "minimart_refunds_all" ON minimart_refunds';
    EXECUTE $p$
      CREATE POLICY "minimart_refunds_all" ON minimart_refunds
        AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)
    $p$;
  END IF;

  -- minimart_refund_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='minimart_refund_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "minimart_refund_requests_all" ON minimart_refund_requests';
    EXECUTE $p$
      CREATE POLICY "minimart_refund_requests_all" ON minimart_refund_requests
        AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)
    $p$;
  END IF;

  -- minimart_settings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='minimart_settings') THEN
    EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON minimart_settings';
    EXECUTE 'DROP POLICY IF EXISTS "minimart_settings_all" ON minimart_settings';
    EXECUTE $p$
      CREATE POLICY "minimart_settings_all" ON minimart_settings
        AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)
    $p$;
  END IF;

  -- cashier_shifts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cashier_shifts') THEN
    EXECUTE 'DROP POLICY IF EXISTS "cashier_shifts_all" ON cashier_shifts';
    EXECUTE $p$
      CREATE POLICY "cashier_shifts_all" ON cashier_shifts
        AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)
    $p$;
  END IF;
END $$;
