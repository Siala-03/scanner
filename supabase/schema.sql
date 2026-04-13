-- ============================================
-- SUPABASE DATABASE SCHEMA
-- Complete migration for Restaurant POS
-- ============================================

-- 1. RESTAURANTS (Multi-tenancy - each restaurant/bar/lounge)
CREATE TABLE IF NOT EXISTS restaurants (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text,
  phone text,
  email text,
  timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  subscription_status text NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert a placeholder - new restaurants created by superadmin
-- DELETE THIS after you have real restaurants
INSERT INTO restaurants (id, name, address, phone, email)
VALUES ('default_restaurant', 'My Restaurant', '123 Main St', '+1234567890', 'admin@restaurant.com')
ON CONFLICT (id) DO NOTHING;

-- 2. STAFF (tied to a specific restaurant)
-- role: superadmin (Servv team), manager, supervisor, waiter, kitchen
-- restaurant_id can be NULL for superadmin
CREATE TABLE IF NOT EXISTS staff (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL CHECK (role in ('superadmin','manager','supervisor','waiter','kitchen')),
  email text NOT NULL,
  phone text NOT null,
  is_on_duty boolean NOT NULL DEFAULT true,
  assigned_tables integer[] NOT NULL DEFAULT '{}',
  performance jsonb NOT NULL DEFAULT '{}',
  hire_date timestamptz NOT NULL DEFAULT now(),
  restaurant_id text REFERENCES restaurants(id)
);

-- Staff credentials - use staff_id as primary key, allow NULL restaurant_id
CREATE TABLE IF NOT EXISTS staff_credentials (
  staff_id text NOT NULL PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password_hash text NOT null,
  restaurant_id text REFERENCES restaurants(id)
);

-- 3. MENU ITEMS
CREATE TABLE IF NOT EXISTS menu_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  price integer NOT NULL,
  category text NOT NULL,
  emoji text DEFAULT '🍽️',
  prep_time integer DEFAULT 15,
  is_available boolean DEFAULT true,
  is_popular boolean DEFAULT false,
  image_url text,
  requires_kitchen boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available, restaurant_id);

-- 4. TABLES
CREATE TABLE IF NOT EXISTS tables (
  id text PRIMARY KEY,
  table_number integer NOT NULL UNIQUE,
  capacity integer DEFAULT 4,
  status text DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 5. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  order_number text NOT NULL,
  table_number integer,
  customer_name text,
  customer_phone text,
  customer_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'preparing', 'ready', 'served', 'cancelled', 'paid')),
  items jsonb NOT NULL DEFAULT '[]',
  subtotal integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  notes text,
  created_by text,
  assigned_to text,
  payment_method text,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  amount_paid integer DEFAULT 0,
  change_amount integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_number, restaurant_id);

-- 6. INVENTORY
CREATE TABLE IF NOT EXISTS inventory_records (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  reorder_point integer NOT NULL DEFAULT 10,
  reorder_qty integer NOT NULL DEFAULT 20,
  unit_cost integer NOT NULL DEFAULT 0,
  supplier_id text,
  location text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_menu_item ON inventory_records(menu_item_id, restaurant_id);

-- 7. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  name text NOT NULL,
  contact_person text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  lead_time_days integer NOT NULL DEFAULT 7,
  payment_terms text NOT NULL DEFAULT 'Net 30',
  rating integer NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 8. PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled')),
  items jsonb NOT NULL DEFAULT '[]',
  total_cost integer NOT NULL DEFAULT 0,
  expected_delivery date,
  received_at timestamptz,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 9. STOCK MOVEMENTS
CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL,
  menu_item_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'sale', 'adjustment', 'waste', 'transfer', 'return')),
  qty integer NOT NULL,
  stock_before integer NOT NULL,
  balance_after integer NOT NULL,
  unit_cost integer,
  total_value integer,
  reference text,
  performed_by text NOT NULL,
  notes text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 10. WASTE
CREATE TABLE IF NOT EXISTS waste_entries (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL,
  menu_item_name text NOT NULL,
  qty integer NOT NULL,
  unit_cost integer NOT NULL,
  total_cost integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('expired', 'spoiled', 'damaged', 'overproduction', 'spillage', 'other')),
  reported_by text NOT NULL,
  recorded_by text NOT NULL,
  notes text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 11. CUSTOMERS / LOYALTY
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text,
  email text,
  phone text,
  total_points integer NOT NULL DEFAULT 0,
  visit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone, restaurant_id);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id),
  order_id text,
  points integer NOT NULL,
  type text NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id),
  reward_id text NOT NULL,
  points_redeemed integer NOT NULL,
  order_id text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 12. CREDIT MANAGEMENT
CREATE TABLE IF NOT EXISTS credit_accounts (
  id text PRIMARY KEY,
  customer_id text,
  customer_name text NOT NULL,
  customer_phone text,
  credit_limit integer NOT NULL DEFAULT 0,
  current_balance integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_applications (
  id text PRIMARY KEY,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  requested_limit integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_limit integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES credit_accounts(id),
  order_id text,
  amount integer NOT NULL,
  type text NOT NULL CHECK (type IN ('charge', 'payment', 'adjustment')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 13. EXPENSES
CREATE TABLE IF NOT EXISTS expense_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES expense_categories(id),
  amount integer NOT NULL,
  description text NOT NULL,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reimbursed')),
  submitted_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- 14. LOCATIONS
CREATE TABLE IF NOT EXISTS locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'storage' CHECK (type IN ('storage', 'kitchen', 'bar', 'display', 'other')),
  is_active boolean DEFAULT true,
  low_stock_items integer DEFAULT 0,
  total_items integer DEFAULT 0,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 15. ANALYTICS / KPIs
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  metric text NOT NULL,
  target_value integer NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  description text,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

CREATE TABLE IF NOT EXISTS kpi_staff_assignments (
  id text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES staff(id),
  kpi_id text NOT NULL REFERENCES kpi_definitions(id),
  current_value integer NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- ============================================
-- SEED DATA
-- ============================================

-- Insert default expense categories
INSERT INTO expense_categories (id, name, description, is_default, restaurant_id)
VALUES 
  ('cat-food', 'Food & Ingredients', 'Cost of food supplies and ingredients', true, 'default_restaurant'),
  ('cat-beverages', 'Beverages', 'Cost of drinks and beverages', true, 'default_restaurant'),
  ('cat-supplies', 'Supplies', 'Kitchen and cleaning supplies', true, 'default_restaurant'),
  ('cat-utilities', 'Utilities', 'Electricity, water, gas', true, 'default_restaurant'),
  ('cat-maintenance', 'Maintenance', 'Equipment and facility maintenance', true, 'default_restaurant'),
  ('cat-marketing', 'Marketing', 'Advertising and promotions', true, 'default_restaurant'),
  ('cat-other', 'Other', 'Miscellaneous expenses', true, 'default_restaurant')
ON CONFLICT (id) DO NOTHING;

-- Insert default location
INSERT INTO locations (id, name, type, restaurant_id)
VALUES ('loc-main', 'Main Storage', 'storage', 'default_restaurant')
ON CONFLICT (id) DO NOTHING;

-- Insert a default superadmin user (username: admin, password: admin123)
-- Note: In production, use Supabase Auth instead of custom credentials
INSERT INTO staff (id, name, role, email, phone, restaurant_id)
VALUES ('superadmin-001', 'Super Admin', 'superadmin', 'admin@servv.com', '+1234567890', 'default_restaurant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_credentials (staff_id, username, password_hash, restaurant_id)
VALUES ('superadmin-001', 'admin', '$2a$10$8K1p/a0dL3.L3.m3J6H1ZO8Y8K1p/a0dL3.L3.m3J6H1ZO8Y', 'default_restaurant')
ON CONFLICT (restaurant_id, username) DO NOTHING;

-- Note: The password hash above is for 'admin123' - you'll need to generate proper hashes

-- Create a sample menu item
INSERT INTO menu_items (id, name, description, price, category, restaurant_id)
VALUES 
  ('item-001', 'Burger', 'Delicious beef burger with cheese', 1299, 'Main Course', 'default_restaurant'),
  ('item-002', 'Fries', 'Crispy golden fries', 499, 'Sides', 'default_restaurant'),
  ('item-003', 'Cola', 'Refreshing cola drink', 199, 'Beverages', 'default_restaurant')
ON CONFLICT (id) DO NOTHING;

-- Create a sample table
INSERT INTO tables (id, table_number, restaurant_id)
VALUES ('table-1', 1, 'default_restaurant')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (RLS) - optional, can be configured later
-- ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- COMPLETE
-- ============================================