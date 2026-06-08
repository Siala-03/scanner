-- Migration 010: Order rejection audit trail
-- Stores who rejected an order, why, and when — separate from customer-facing notes.
-- Run via Supabase SQL editor.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancellation_note text,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_at
  ON orders (cancelled_at)
  WHERE cancelled_at IS NOT NULL;
