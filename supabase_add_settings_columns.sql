-- Run this in Supabase: SQL Editor > New Query > paste & Run.
-- Safe to re-run — all statements use IF NOT EXISTS.

-- =============================================
-- RESTAURANTS TABLE
-- =============================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS momo_code text;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS country text;

-- =============================================
-- ORDERS TABLE — payment tracking columns
-- =============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_type text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_breakdown jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_note text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_confirmed_by text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_confirmed_by_name text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_waiter_id text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS requires_kitchen boolean;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Prevent duplicate orders from offline queue retries
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
