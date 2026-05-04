-- Migration 045: Ensure idempotency_key has a proper unique constraint on orders
-- The partial index from 038/040 is retained; this adds a named constraint
-- so duplicate submissions return error code 23505 with a predictable constraint name.

-- Drop old unnamed indexes first (if they exist under different names)
DROP INDEX IF EXISTS idx_orders_idempotency_key;

-- Recreate as a named partial unique index (PostgreSQL doesn't support partial unique constraints,
-- but a unique index with a WHERE clause is functionally equivalent and gives code 23505).
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
