-- =============================================================================
-- RLS Policies for Servv
-- Run this in Supabase SQL Editor.
--
-- Architecture:
--   • Customer operations → Edge Functions (service key server-side, never in browser)
--   • Staff operations    → anon key + broad RLS (scoped by restaurant_id in app logic)
--   • staff_credentials   → NO anon access (login/password via Edge Function only)
--
-- The uuid = text error is avoided entirely: we do NOT use auth.uid() because
-- this app uses a custom staff auth system, not Supabase Auth.
-- =============================================================================


-- =============================================================================
-- Step 1 — Enable RLS on every public table
--          Uses "if exists" so unknown table names fail silently, not fatally.
-- =============================================================================
alter table if exists menu_items           enable row level security;
alter table if exists online_qr_codes      enable row level security;
alter table if exists orders               enable row level security;
alter table if exists staff                enable row level security;
alter table if exists staff_credentials    enable row level security;
alter table if exists restaurants          enable row level security;
alter table if exists inventory_records    enable row level security;
alter table if exists suppliers            enable row level security;
alter table if exists customers            enable row level security;
alter table if exists stock_movements      enable row level security;
alter table if exists purchase_orders      enable row level security;
alter table if exists expenses             enable row level security;
alter table if exists expense_categories   enable row level security;
alter table if exists credit_accounts      enable row level security;
alter table if exists credit_transactions  enable row level security;
alter table if exists credit_applications  enable row level security;
alter table if exists loyalty_transactions enable row level security;
alter table if exists rewards              enable row level security;
alter table if exists kpis                 enable row level security;
alter table if exists tables               enable row level security;
alter table if exists waste_entries        enable row level security;
alter table if exists inventory_locations  enable row level security;


-- =============================================================================
-- Step 2 — staff_credentials: block all direct anon access
--           Login and password change go through the staff-login Edge Function.
-- =============================================================================
-- (no policies created = anon is denied by default when RLS is enabled)


-- =============================================================================
-- Step 3 — menu_items
--   Customers read available items via customer-menu Edge Function (service key).
--   Staff manage items via the app (anon key + RLS below).
-- =============================================================================
drop policy if exists "anon_read_available_menu" on menu_items;
drop policy if exists "anon_manage_menu_items"    on menu_items;

create policy "anon_read_available_menu"
  on menu_items for select to anon
  using (is_available = true);

create policy "anon_manage_menu_items"
  on menu_items for all to anon
  using (true) with check (true);


-- =============================================================================
-- Step 4 — online_qr_codes
--   Customers validate QR codes via customer-qr Edge Function (service key).
--   Staff manage QR codes via the app (anon key).
-- =============================================================================
drop policy if exists "anon_read_active_qr"  on online_qr_codes;
drop policy if exists "anon_manage_qr_codes" on online_qr_codes;

create policy "anon_read_active_qr"
  on online_qr_codes for select to anon
  using (is_active = true);

create policy "anon_manage_qr_codes"
  on online_qr_codes for all to anon
  using (true) with check (true);


-- =============================================================================
-- Step 5 — orders
--   Customer order creation → customer-place-order Edge Function (prices
--   re-validated server-side). Staff read/update via anon key.
-- =============================================================================
drop policy if exists "anon_all_orders" on orders;

create policy "anon_all_orders"
  on orders for all to anon
  using (true) with check (true);


-- =============================================================================
-- Step 6 — staff
--   Read + update by anon (the app). Insert/delete only via admin-staff Edge
--   Function which enforces caller role server-side.
-- =============================================================================
drop policy if exists "anon_read_staff"   on staff;
drop policy if exists "anon_update_staff" on staff;

create policy "anon_read_staff"
  on staff for select to anon
  using (true);

create policy "anon_update_staff"
  on staff for update to anon
  using (true) with check (true);


-- =============================================================================
-- Step 7 — restaurants
-- =============================================================================
drop policy if exists "anon_read_restaurants"   on restaurants;
drop policy if exists "anon_update_restaurants" on restaurants;

create policy "anon_read_restaurants"
  on restaurants for select to anon
  using (true);

create policy "anon_update_restaurants"
  on restaurants for update to anon
  using (true) with check (true);


-- =============================================================================
-- Step 8 — all remaining staff-facing tables (broad anon access)
--          Table names here match what the API code actually queries.
-- =============================================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'inventory_records',
    'suppliers',
    'customers',
    'stock_movements',
    'purchase_orders',
    'expenses',
    'expense_categories',
    'credit_accounts',
    'credit_transactions',
    'credit_applications',
    'loyalty_transactions',
    'rewards',
    'kpis',
    'tables',
    'waste_entries',
    'inventory_locations'
  ])
  loop
    -- Only act on tables that actually exist in this project
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'drop policy if exists "anon_all_%s" on %I;
         create policy "anon_all_%s" on %I for all to anon using (true) with check (true);',
        t, t, t, t
      );
    end if;
  end loop;
end $$;
