-- Migration 009: Add idempotency_key to orders for offline duplicate prevention
-- Run this against your live Supabase database via the SQL editor or CLI.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
