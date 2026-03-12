-- ============================================
-- INVENTORY MANAGEMENT TABLES
-- ============================================

-- Inventory Records (stock for each menu item)
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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_menu_item ON inventory_records(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory_records(supplier_id);

-- Suppliers
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- Purchase Orders
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- Stock Movements (audit trail)
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
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_menu_item ON stock_movements(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_movements_timestamp ON stock_movements(timestamp);

-- Waste Log
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
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waste_menu_item ON waste_entries(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_waste_reason ON waste_entries(reason);
CREATE INDEX IF NOT EXISTS idx_waste_timestamp ON waste_entries(timestamp);
