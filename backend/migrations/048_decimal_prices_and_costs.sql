-- ============================================================
-- Allow decimal prices and costs for products and inventory
-- Keeps quantity/count fields as integers.
-- ============================================================

ALTER TABLE menu_items
  ALTER COLUMN price TYPE numeric(12,2) USING price::numeric(12,2);

ALTER TABLE orders
  ALTER COLUMN subtotal TYPE numeric(12,2) USING subtotal::numeric(12,2),
  ALTER COLUMN tax TYPE numeric(12,2) USING tax::numeric(12,2),
  ALTER COLUMN total TYPE numeric(12,2) USING total::numeric(12,2);

ALTER TABLE inventory_records
  ALTER COLUMN unit_cost TYPE numeric(12,2) USING unit_cost::numeric(12,2);

-- Add price column if missing (created by 047), then convert to decimal
ALTER TABLE inventory_records
  ADD COLUMN IF NOT EXISTS price integer NOT NULL DEFAULT 0;
ALTER TABLE inventory_records
  ALTER COLUMN price TYPE numeric(12,2) USING price::numeric(12,2);

ALTER TABLE purchase_orders
  ALTER COLUMN total_cost TYPE numeric(12,2) USING total_cost::numeric(12,2);

ALTER TABLE stock_movements
  ALTER COLUMN unit_cost TYPE numeric(12,2) USING unit_cost::numeric(12,2),
  ALTER COLUMN total_value TYPE numeric(12,2) USING total_value::numeric(12,2);

ALTER TABLE waste_entries
  ALTER COLUMN unit_cost TYPE numeric(12,2) USING unit_cost::numeric(12,2),
  ALTER COLUMN total_cost TYPE numeric(12,2) USING total_cost::numeric(12,2);
