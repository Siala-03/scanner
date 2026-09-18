-- One-time bootstrap: marks migrations 001-076 as already applied in
-- schema_migrations, since the live database already has their schema
-- (built up before this migrate.ts tracking table existed) but the tracking
-- table itself doesn't know that yet — which is why `npm run migrate` fails
-- on 007 with "relation already exists" instead of skipping past it.
--
-- Run this ONCE directly (Supabase SQL editor or psql), then run
-- `npm run migrate` again — it will skip 001-076 and apply only 077 onward.
--
-- Deliberately kept in backend/scripts/, NOT backend/migrations/ — migrate.ts
-- scans every .sql file in the migrations folder and would otherwise try to
-- run this itself (in the wrong order, after 001-076 had already failed).

create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

insert into schema_migrations (id) values
  ('001_auth.sql'),
  ('002_inventory.sql'),
  ('003_orders.sql'),
  ('004_indexes.sql'),
  ('005_menu.sql'),
  ('006_tables.sql'),
  ('007_multi_tenancy.sql'),
  ('008_analytics_improvements.sql'),
  ('008_superadmin.sql'),
  ('009_loyalty_program.sql'),
  ('010_kpis.sql'),
  ('011_kpi_staff_assignments.sql'),
  ('012_forecasting.sql'),
  ('013_delivery_integration.sql'),
  ('014_loyalty_order_fields.sql'),
  ('015_enterprise_inventory.sql'),
  ('016_unify_inventory.sql'),
  ('017_add_restaurant_to_inventory.sql'),
  ('018_expense_management.sql'),
  ('019_expense_approval_workflow.sql'),
  ('020_expense_receipts.sql'),
  ('020_supplier_interface.sql'),
  ('021_requires_kitchen.sql'),
  ('022_credit_management.sql'),
  ('023_menu_items_requires_kitchen.sql'),
  ('024_enable_realtime.sql'),
  ('025_set_restaurant_currency_rwf.sql'),
  ('026_set_expense_currency_rwf.sql'),
  ('027_normalize_all_currency_defaults_to_rwf.sql'),
  ('028_fix_order_status_and_kitchen_default.sql'),
  ('029_table_service_sessions.sql'),
  ('030_add_loyalty_columns_to_customers.sql'),
  ('031_menu_modifiers.sql'),
  ('032_promotions.sql'),
  ('033_reservations.sql'),
  ('034_staff_schedules.sql'),
  ('035_reviews.sql'),
  ('036_menu_item_reviews.sql'),
  ('037_ebm_fiscal.sql'),
  ('038_order_payment_approval.sql'),
  ('039_outlet_type.sql'),
  ('040_fix_payment_status_constraint.sql'),
  ('041_payment_confirmed_by_name.sql'),
  ('042_restaurants_rls_policies.sql'),
  ('043_cashier_role.sql'),
  ('044_staff_schedules_fk.sql'),
  ('045_orders_idempotency_unique.sql'),
  ('046_tenant_rls.sql'),
  ('047_minimart_inventory_fields.sql'),
  ('048_decimal_prices_and_costs.sql'),
  ('049_inventory_decimal_quantities.sql'),
  ('050_inventory_description_dates.sql'),
  ('051_cashier_shifts.sql'),
  ('052_minimart_refunds.sql'),
  ('053_minimart_settings.sql'),
  ('054_menu_items_sku.sql'),
  ('055_delete_orphan_menu_items.sql'),
  ('056_minimart_refund_requests.sql'),
  ('057_orders_refund_columns.sql'),
  ('058_fix_refund_requests_rls.sql'),
  ('059_fix_refund_requests_rls_anon.sql'),
  ('060_fix_minimart_refunds_restaurant_id.sql'),
  ('061_fix_cashier_shifts_restaurant_id.sql'),
  ('062_ensure_rls_all_minimart_tables.sql'),
  ('063_fix_restaurants_write_rls.sql'),
  ('064_fix_minimart_settings_restaurant_id.sql'),
  ('065_inventory_category.sql'),
  ('066_expense_amount_decimal.sql'),
  ('067_order_cancellation_requests.sql'),
  ('068_ebm_fiscal_jobs.sql'),
  ('069_ebm_osdc_columns.sql'),
  ('070_receipt_counters.sql'),
  ('071_device_keys.sql'),
  ('072_osdc_sync_state.sql'),
  ('073_order_payment_type.sql'),
  ('074_order_cancel_reason.sql'),
  ('075_fix_orders_rls_anon.sql'),
  ('076_tables_per_restaurant_number.sql')
on conflict (id) do nothing;
