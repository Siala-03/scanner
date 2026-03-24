-- ============================================
-- MULTI-TENANCY: RESTAURANTS TABLE
-- ============================================

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

-- Insert default restaurant for existing data
INSERT INTO restaurants (id, name, address, phone, email)
VALUES ('default_restaurant', 'Default Restaurant', '123 Main St', '+1234567890', 'admin@restaurant.com')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- UPDATE EXISTING TABLES FOR MULTI-TENANCY
-- ============================================

-- Add restaurant_id to staff (allow same email/username across restaurants)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_email_key; -- Remove global uniqueness
ALTER TABLE staff ADD CONSTRAINT staff_email_restaurant_unique UNIQUE (email, restaurant_id);

-- Add restaurant_id to staff_credentials (allow same username across restaurants)
ALTER TABLE staff_credentials ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE staff_credentials DROP CONSTRAINT IF EXISTS staff_credentials_pkey; -- Remove global username uniqueness
ALTER TABLE staff_credentials ADD CONSTRAINT staff_credentials_restaurant_username_unique UNIQUE (restaurant_id, username);

-- Add restaurant_id to other tables
ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE waste_entries ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);
ALTER TABLE tables ADD COLUMN IF NOT EXISTS restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON staff(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_staff_credentials_restaurant ON staff_credentials(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_records(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_restaurant ON suppliers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);