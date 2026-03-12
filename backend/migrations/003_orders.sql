-- ============================================
-- ORDERS & KITCHEN DISPLAY SYSTEM TABLES
-- ============================================

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  order_number text NOT NULL,
  table_number integer,
  customer_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  items jsonb NOT NULL DEFAULT '[]',
  subtotal integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  notes text,
  created_by text,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Order items (embedded in orders.items JSON, but useful for reference)
CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id text NOT NULL,
  menu_item_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price integer NOT NULL,
  total_price integer NOT NULL,
  modifiers text[],
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
