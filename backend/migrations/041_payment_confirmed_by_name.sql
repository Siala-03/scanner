-- Migration 041: Store the confirmer's display name on payment confirmation
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_confirmed_by_name TEXT;
