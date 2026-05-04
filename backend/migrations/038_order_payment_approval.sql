-- Duplicate order prevention: one idempotency key per unique order submission
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Payment approval workflow
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'confirmed')),
  ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

-- Backfill: orders already completed/served count as confirmed
UPDATE orders
SET payment_status = 'confirmed'
WHERE status IN ('served', 'completed')
  AND payment_status IS NULL;

-- Index for supervisor "unpaid orders" query
CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON orders(restaurant_id, payment_status)
  WHERE payment_status = 'unpaid';
