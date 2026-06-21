-- Add missing columns to the restaurants table.
-- Run this in Supabase: SQL Editor > New Query > paste & Run.

-- 1. settings JSONB — stores receipt config, IP restriction, currency, momoCode, etc.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';

-- 2. momo_code — standalone column for Mobile Money code (fallback if JSONB unavailable)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS momo_code text;

-- 3. logo_url — base64 or URL for the company logo shown on receipts
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS logo_url text;

-- 4. city & country — used in receipt headers
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS country text;
