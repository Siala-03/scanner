-- ============================================
-- SUPPLIER INTERFACE TABLES
-- ============================================

-- Supplier Users (for supplier portal login)
CREATE TABLE IF NOT EXISTS supplier_users (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_users_email ON supplier_users(email);
CREATE INDEX IF NOT EXISTS idx_supplier_users_supplier ON supplier_users(supplier_id);

-- Update purchase_orders with additional tracking fields
ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS restaurant_id text,
  ADD COLUMN IF NOT EXISTS restaurant_name text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_by text,
  ADD COLUMN IF NOT EXISTS received_by text,
  ADD COLUMN IF NOT EXISTS received_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS carrier text;

-- Update status to include 'shipped' status
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders 
  ADD CONSTRAINT purchase_orders_status_check 
  CHECK (status IN ('draft', 'sent', 'confirmed', 'shipped', 'partial', 'received', 'cancelled'));

-- Add notification preferences for suppliers
CREATE TABLE IF NOT EXISTS supplier_notifications (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  email_notifications boolean NOT NULL DEFAULT true,
  order_created boolean NOT NULL DEFAULT true,
  order_reminder boolean NOT NULL DEFAULT true,
  order_received boolean NOT NULL DEFAULT true,
  low_stock_alerts boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_notifications ON supplier_notifications(supplier_id);

-- Order status history for tracking
CREATE TABLE IF NOT EXISTS purchase_order_status_history (
  id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by text NOT NULL,
  changed_by_type text NOT NULL CHECK (changed_by_type IN ('supplier', 'client', 'system')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_status_history ON purchase_order_status_history(purchase_order_id);
