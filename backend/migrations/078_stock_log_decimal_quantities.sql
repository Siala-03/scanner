-- Migration 078: Decimal quantities in stock movement and waste logs
--
-- 049 made inventory_records quantities numeric(12,2) so items like 2.5 kg can
-- be stocked. The logs were left as integer, so recording a decimal sale,
-- adjustment, PO receipt or waste failed and the movement was silently dropped.
--
-- Safe to run more than once. Re-applies 049 in case it was never run.

ALTER TABLE inventory_records
  ALTER COLUMN stock TYPE numeric(12,2) USING stock::numeric(12,2),
  ALTER COLUMN low_stock_threshold TYPE numeric(12,2) USING low_stock_threshold::numeric(12,2),
  ALTER COLUMN reorder_point TYPE numeric(12,2) USING reorder_point::numeric(12,2),
  ALTER COLUMN reorder_qty TYPE numeric(12,2) USING reorder_qty::numeric(12,2);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'inventory_records' AND column_name = 'qty_start') THEN
    ALTER TABLE inventory_records
      ALTER COLUMN qty_start TYPE numeric(12,2) USING qty_start::numeric(12,2);
  END IF;
END $$;

ALTER TABLE stock_movements
  ALTER COLUMN qty TYPE numeric(12,2) USING qty::numeric(12,2),
  ALTER COLUMN stock_before TYPE numeric(12,2) USING stock_before::numeric(12,2),
  ALTER COLUMN balance_after TYPE numeric(12,2) USING balance_after::numeric(12,2);

ALTER TABLE waste_entries
  ALTER COLUMN qty TYPE numeric(12,2) USING qty::numeric(12,2);
