-- Migration 040: Fix payment_status check constraint on orders
-- The column may have been created with a different set of allowed values.
-- Drop and recreate the constraint to allow 'unpaid' | 'confirmed'.

-- Drop any existing check constraint on payment_status (name may vary)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Ensure column exists with correct default
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- Add correct constraint
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'confirmed'));

-- Add remaining payment approval columns if not already present
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Back-fill: mark already-completed orders as confirmed
UPDATE orders
  SET payment_status = 'confirmed'
  WHERE status IN ('served', 'completed')
    AND (payment_status IS NULL OR payment_status = 'unpaid');

-- Index for fast pending-payment queries
CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON orders(restaurant_id, payment_status)
  WHERE payment_status = 'unpaid';
