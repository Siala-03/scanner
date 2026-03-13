-- Database indexes for performance optimization
-- Run this migration to add important indexes
-- Using IF NOT EXISTS to skip indexes that already exist or tables that don't exist

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_table_number ON orders(table_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Staff table indexes
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_is_on_duty ON staff(is_on_duty);

-- Staff credentials index (for login)
CREATE INDEX IF NOT EXISTS idx_staff_credentials_username ON staff_credentials(username);

-- Inventory records indexes
CREATE INDEX IF NOT EXISTS idx_inventory_menu_item_id ON inventory_records(menu_item_id);
