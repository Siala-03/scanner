-- ============================================================
-- Allow decimal quantities in inventory_records for minimart uploads
-- ============================================================

ALTER TABLE inventory_records
  ALTER COLUMN stock TYPE numeric(12,2) USING stock::numeric(12,2),
  ALTER COLUMN low_stock_threshold TYPE numeric(12,2) USING low_stock_threshold::numeric(12,2),
  ALTER COLUMN reorder_point TYPE numeric(12,2) USING reorder_point::numeric(12,2),
  ALTER COLUMN reorder_qty TYPE numeric(12,2) USING reorder_qty::numeric(12,2),
  ALTER COLUMN qty_start TYPE numeric(12,2) USING qty_start::numeric(12,2);

COMMENT ON COLUMN inventory_records.stock IS 'Current quantity (supports decimals)';
COMMENT ON COLUMN inventory_records.low_stock_threshold IS 'Low stock threshold (supports decimals)';
COMMENT ON COLUMN inventory_records.reorder_point IS 'Reorder trigger point (supports decimals)';
COMMENT ON COLUMN inventory_records.reorder_qty IS 'Suggested reorder quantity (supports decimals)';
COMMENT ON COLUMN inventory_records.qty_start IS 'Starting quantity for batch (supports decimals)';
