-- Migration 057: Add refund tracking columns to orders table
-- Allows approved refunds to be reflected on the original order
-- so that revenue calculations can deduct refunded amounts.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_amount  NUMERIC(12, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refund_reason  TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refunded_at    TIMESTAMPTZ    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refunded_by    TEXT           DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_refunded_at
  ON orders (restaurant_id, refunded_at)
  WHERE refunded_at IS NOT NULL;
