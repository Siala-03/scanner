-- ============================================================
-- Ensure description, expiry_date, purchase_date exist on inventory_records
-- Safe to run even if 047_minimart_inventory_fields.sql was already applied
-- ============================================================

ALTER TABLE inventory_records
  ADD COLUMN IF NOT EXISTS description   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expiry_date   date,
  ADD COLUMN IF NOT EXISTS purchase_date date;
