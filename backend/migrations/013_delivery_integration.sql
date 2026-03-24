-- ============================================
-- Delivery integration for VubaVuba
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_provider text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_order_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivery_data jsonb;

-- Ensure Vuba-specific status path exists
ALTER TABLE orders
  ALTER COLUMN delivery_status SET DEFAULT 'pending';

-- Add indexes for faster delivery queries
CREATE INDEX IF NOT EXISTS idx_orders_delivery_provider ON orders(delivery_provider);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
