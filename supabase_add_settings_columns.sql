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

-- =============================================
-- EXPENSES TABLE — ensure all required columns exist
-- =============================================

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL,
  category_id text,
  vendor_name text,
  description text,
  amount numeric DEFAULT 0,
  expense_date date,
  payment_method text,
  payment_status text DEFAULT 'pending',
  reference_number text,
  notes text,
  is_recurring boolean DEFAULT false,
  recurring_frequency text,
  tax_amount numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  is_tax_deductible boolean DEFAULT false,
  status text DEFAULT 'pending',
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  created_by text,
  submitted_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns that may be missing on older schemas
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_by text;

-- =============================================
-- EXPENSE CATEGORIES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id text PRIMARY KEY,
  restaurant_id text,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6b7280',
  icon text DEFAULT 'receipt',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
