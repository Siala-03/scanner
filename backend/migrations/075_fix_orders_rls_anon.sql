-- Migration 075: Grant anon role access to all tenant tables
-- Migration 046 enabled RLS on these tables with policies only for the
-- "authenticated" role, but the app uses the Supabase anon key with custom
-- staff auth (not Supabase Auth). Without anon-accessible policies every
-- INSERT/UPDATE on these tables is denied → 401 on order submission etc.
-- Same pattern as migration 063 which fixed the restaurants table.

DO $$
DECLARE
  tbl text;
  tables_to_fix text[] := ARRAY[
    'menu_items', 'orders', 'staff', 'staff_credentials', 'tables',
    'inventory_records', 'suppliers', 'purchase_orders', 'stock_movements',
    'waste_entries', 'customers', 'loyalty_transactions', 'rewards',
    'reward_redemptions', 'credit_accounts', 'expenses', 'expense_categories',
    'reservations', 'promotions', 'kpis', 'staff_schedules',
    'ebm_config', 'ebm_invoices', 'order_cancellation_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_fix LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Drop the authenticated-only policy from migration 046
      EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', tbl);

      -- Permissive policies for all roles (no TO clause = PUBLIC)
      EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (true)', tbl, tbl);

      EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);

      EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE USING (true) WITH CHECK (true)', tbl, tbl);

      EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (true)', tbl, tbl);
    END IF;
  END LOOP;
END $$;
