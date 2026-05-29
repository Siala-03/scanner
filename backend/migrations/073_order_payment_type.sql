-- Migration 073: Store payment method and split breakdown on confirmed orders
-- Required for per-method reconciliation reporting (Cash vs MOMO vs Card etc.)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_type      TEXT,
  ADD COLUMN IF NOT EXISTS payment_breakdown JSONB;

COMMENT ON COLUMN orders.payment_type IS
  'Primary payment method code set at confirmation: 01=Cash, 02=Card, 03=Cheque, 04=MoMo';

COMMENT ON COLUMN orders.payment_breakdown IS
  'Full split-payment array: [{method, amount, reference?}]. Enables accurate per-channel reconciliation.';

-- Index for fast reconciliation queries filtered by restaurant + method
CREATE INDEX IF NOT EXISTS idx_orders_payment_type
  ON orders (restaurant_id, payment_type)
  WHERE payment_status = 'confirmed';
