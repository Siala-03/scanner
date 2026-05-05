-- ============================================================
-- Minimart inventory extended fields
-- Adds: description, expiry_date, purchase_date, qty_start, price
-- These map directly to the export/import template columns:
-- Item_ID | Description | Expiry_Date | Purchase_Date | Qty_Start | Current_Qty | Cost | Price | Location
-- ============================================================

ALTER TABLE inventory_records
  ADD COLUMN IF NOT EXISTS description    text         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expiry_date    date,
  ADD COLUMN IF NOT EXISTS purchase_date  date,
  ADD COLUMN IF NOT EXISTS qty_start      integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price          integer      NOT NULL DEFAULT 0;

COMMENT ON COLUMN inventory_records.description   IS 'Human-readable item description';
COMMENT ON COLUMN inventory_records.expiry_date   IS 'Expiry / best-before date for the current batch';
COMMENT ON COLUMN inventory_records.purchase_date IS 'Date the current batch was purchased';
COMMENT ON COLUMN inventory_records.qty_start     IS 'Initial quantity when batch was received (used for depletion %%)';
COMMENT ON COLUMN inventory_records.price         IS 'Selling price (RWF) — mirrors menu_items.price for convenience';
