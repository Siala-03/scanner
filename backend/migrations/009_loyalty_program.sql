-- ============================================
-- LOYALTY PROGRAM TABLES
-- ============================================

-- Customers table for loyalty program
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  phone text UNIQUE,
  email text,
  name text,
  total_points integer NOT NULL DEFAULT 0,
  total_spent integer NOT NULL DEFAULT 0,
  join_date timestamptz NOT NULL DEFAULT now(),
  last_visit timestamptz,
  visit_count integer NOT NULL DEFAULT 0,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Loyalty points transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'adjusted')),
  points integer NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- Rewards catalog
CREATE TABLE IF NOT EXISTS rewards (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  points_required integer NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('discount', 'free_item', 'service')),
  discount_percentage integer, -- for discount type
  free_item_id text, -- for free_item type
  is_active boolean NOT NULL DEFAULT true,
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Customer reward redemptions
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_id text NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  points_used integer NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  restaurant_id text NOT NULL DEFAULT 'default_restaurant' REFERENCES restaurants(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order_id ON loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_customer_id ON reward_redemptions(customer_id);

-- Add customer_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers(id);

-- Insert default rewards
INSERT INTO rewards (id, name, description, points_required, reward_type, discount_percentage, restaurant_id) VALUES
('reward-1', '10% Off Next Order', 'Get 10% discount on your next order', 100, 'discount', 10, 'default_restaurant'),
('reward-2', 'Free Coffee', 'Redeem for a free coffee', 50, 'free_item', null, 'default_restaurant'),
('reward-3', '20% Off Next Order', 'Get 20% discount on your next order', 200, 'discount', 20, 'default_restaurant'),
('reward-4', 'Free Dessert', 'Redeem for a free dessert', 150, 'free_item', null, 'default_restaurant')
ON CONFLICT (id) DO NOTHING;