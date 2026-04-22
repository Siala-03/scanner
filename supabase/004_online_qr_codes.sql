-- ============================================
-- ONLINE ORDERING QR CODES MIGRATION
-- ============================================

BEGIN;

-- 1. ONLINE QR CODES TABLE
CREATE TABLE IF NOT EXISTS online_qr_codes (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code_token text NOT NULL UNIQUE,
  qr_url text NOT NULL,
  short_link text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  regenerated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_qr_codes_restaurant
  ON online_qr_codes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_online_qr_codes_token
  ON online_qr_codes(code_token);
CREATE INDEX IF NOT EXISTS idx_online_qr_codes_short_link
  ON online_qr_codes(short_link);

-- 2. ADD ONLINE ORDER TRACKING TO ORDERS TABLE
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_online_order boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_qr_code_id text REFERENCES online_qr_codes(id),
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_address text;

-- Create index for online orders
CREATE INDEX IF NOT EXISTS idx_orders_online_qr
  ON orders(online_qr_code_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_is_online
  ON orders(is_online_order, restaurant_id, created_at DESC);

-- 3. ADD SETTINGS TO RESTAURANTS FOR ONLINE ORDERING
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS online_ordering_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_media_links jsonb DEFAULT '{}';

-- 4. ROW LEVEL SECURITY POLICIES

-- Enable RLS on online_qr_codes table
ALTER TABLE online_qr_codes ENABLE ROW LEVEL SECURITY;

-- Anonymous users can view active QR codes by token (for ordering)
CREATE POLICY "Anonymous can view active QR codes by token"
  ON online_qr_codes
  FOR SELECT
  USING (is_active = true);

-- Authenticated restaurant staff can view and manage their own QR codes
CREATE POLICY "Authenticated staff can view own restaurant QR codes"
  ON online_qr_codes
  FOR SELECT
  USING (
    auth.jwt()->'app_metadata'->>'restaurant_id' = restaurant_id
    OR auth.jwt()->'user_metadata'->>'restaurant_id' = restaurant_id
  );

CREATE POLICY "Authenticated staff can manage own restaurant QR codes"
  ON online_qr_codes
  FOR ALL
  USING (
    auth.jwt()->'app_metadata'->>'restaurant_id' = restaurant_id
    OR auth.jwt()->'user_metadata'->>'restaurant_id' = restaurant_id
  );

-- Enable RLS on orders table (if not already enabled)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Anonymous users can INSERT online orders (without authentication)
CREATE POLICY "Anonymous can create online orders"
  ON orders
  FOR INSERT
  WITH CHECK (
    is_online_order = true 
    AND customer_name IS NOT NULL 
    AND customer_phone IS NOT NULL
  );

-- Authenticated staff can view their restaurant's orders
CREATE POLICY "Authenticated staff can view own restaurant orders"
  ON orders
  FOR SELECT
  USING (
    auth.jwt()->'app_metadata'->>'restaurant_id' = restaurant_id
    OR auth.jwt()->'user_metadata'->>'restaurant_id' = restaurant_id
  );

-- Authenticated staff can update their restaurant's orders
CREATE POLICY "Authenticated staff can update own restaurant orders"
  ON orders
  FOR UPDATE
  USING (
    auth.jwt()->'app_metadata'->>'restaurant_id' = restaurant_id
    OR auth.jwt()->'user_metadata'->>'restaurant_id' = restaurant_id
  );

COMMIT;
