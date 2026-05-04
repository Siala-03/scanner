-- Migration 046: Proper tenant isolation via Row Level Security
-- Uses existence checks so missing tables are silently skipped.
-- Requires JWT signed with SUPABASE_JWT_SECRET containing 'restaurant_id' claim.

-- ── Helper functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_tenant_id()
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT nullif(auth.jwt() ->> 'restaurant_id', '')
  $$;

CREATE OR REPLACE FUNCTION current_is_superadmin()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT (auth.jwt() ->> 'staff_role') = 'superadmin'
  $$;

-- ── restaurants ───────────────────────────────────────────────────────────────
-- Drop old permissive policies from migration 042
DROP POLICY IF EXISTS "Allow insert restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow update restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow delete restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow all restaurants"    ON restaurants;

-- Authenticated: read own restaurant, or superadmin reads all
DROP POLICY IF EXISTS "restaurants_authenticated_read" ON restaurants;
CREATE POLICY "restaurants_authenticated_read" ON restaurants
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = current_tenant_id() OR current_is_superadmin());

-- Anon: public read (QR menu display needs outlet_type + name)
DROP POLICY IF EXISTS "restaurants_anon_read" ON restaurants;
CREATE POLICY "restaurants_anon_read" ON restaurants
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);

-- Writes: superadmin only
DROP POLICY IF EXISTS "restaurants_superadmin_insert" ON restaurants;
CREATE POLICY "restaurants_superadmin_insert" ON restaurants
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_is_superadmin());

DROP POLICY IF EXISTS "restaurants_superadmin_update" ON restaurants;
CREATE POLICY "restaurants_superadmin_update" ON restaurants
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (current_is_superadmin())
  WITH CHECK (current_is_superadmin());

DROP POLICY IF EXISTS "restaurants_superadmin_delete" ON restaurants;
CREATE POLICY "restaurants_superadmin_delete" ON restaurants
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (current_is_superadmin());

-- ── Standard tenant tables (have restaurant_id column) ───────────────────────
-- Applied only to tables that exist AND have a restaurant_id column.

DO $$
DECLARE
  tbl text;
  standard_tables text[] := ARRAY[
    'menu_items', 'orders', 'staff', 'staff_credentials', 'tables',
    'inventory_records', 'suppliers', 'purchase_orders', 'stock_movements',
    'waste_entries', 'customers', 'loyalty_transactions', 'rewards',
    'reward_redemptions', 'credit_accounts', 'expenses', 'expense_categories',
    'reservations', 'promotions', 'kpis', 'staff_schedules',
    'ebm_config', 'ebm_invoices'
  ];
BEGIN
  FOREACH tbl IN ARRAY standard_tables LOOP
    -- Only proceed if the table exists and has restaurant_id
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'restaurant_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', tbl);
      EXECUTE format($q$
        CREATE POLICY "tenant_isolation" ON %I
          AS PERMISSIVE FOR ALL TO authenticated
          USING (restaurant_id = current_tenant_id() OR current_is_superadmin())
          WITH CHECK (restaurant_id = current_tenant_id() OR current_is_superadmin())
      $q$, tbl);
    END IF;
  END LOOP;
END $$;

-- ── menu_items: extra anon read for QR flows ──────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'menu_items'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "public_menu_read" ON menu_items';
    EXECUTE $q$
      CREATE POLICY "public_menu_read" ON menu_items
        AS PERMISSIVE FOR SELECT TO anon
        USING (true)
    $q$;
  END IF;
END $$;

-- ── credit_transactions: isolate via parent credit_account ────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'credit_transactions'
  ) THEN
    EXECUTE 'ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON credit_transactions';
    EXECUTE $q$
      CREATE POLICY "tenant_isolation" ON credit_transactions
        AS PERMISSIVE FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM credit_accounts ca
            WHERE ca.id = credit_transactions.account_id
              AND (ca.restaurant_id = current_tenant_id() OR current_is_superadmin())
          )
        )
    $q$;
  END IF;
END $$;

-- ── credit_alerts: isolate via parent credit_account ─────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'credit_alerts'
  ) THEN
    EXECUTE 'ALTER TABLE credit_alerts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation" ON credit_alerts';
    EXECUTE $q$
      CREATE POLICY "tenant_isolation" ON credit_alerts
        AS PERMISSIVE FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM credit_accounts ca
            WHERE ca.id = credit_alerts.account_id
              AND (ca.restaurant_id = current_tenant_id() OR current_is_superadmin())
          )
        )
    $q$;
  END IF;
END $$;
