-- ============================================
-- UNIFY INVENTORY SYSTEM
-- Link inventory_records to inventory_items
-- ============================================

-- Wrap all operations in a DO block to catch errors gracefully
DO $$
BEGIN
  -- Check if inventory_items table exists before proceeding
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
    
    -- Add inventory_item_id to inventory_records if column doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'inventory_records' AND column_name = 'inventory_item_id'
    ) THEN
      ALTER TABLE inventory_records 
      ADD COLUMN inventory_item_id text REFERENCES inventory_items(id);
      
      CREATE INDEX IF NOT EXISTS idx_inventory_records_item 
      ON inventory_records(inventory_item_id);
    END IF;
    
    -- Add location_id to inventory_records if column doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'inventory_records' AND column_name = 'location_id'
    ) THEN
      ALTER TABLE inventory_records 
      ADD COLUMN location_id text;
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_locations') THEN
        ALTER TABLE inventory_records 
        ADD CONSTRAINT fk_inventory_location 
        FOREIGN KEY (location_id) REFERENCES inventory_locations(id);
      END IF;
      
      CREATE INDEX IF NOT EXISTS idx_inventory_records_location 
      ON inventory_records(location_id);
    END IF;
  END IF;
END $$;

-- Create inventory_stock table if not exists
CREATE TABLE IF NOT EXISTS inventory_stock (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL,
    location_id text,
    quantity numeric NOT NULL DEFAULT 0,
    reserved_qty numeric NOT NULL DEFAULT 0,
    min_level numeric NOT NULL DEFAULT 0,
    max_level numeric NOT NULL DEFAULT 0,
    reorder_point numeric NOT NULL DEFAULT 0,
    reorder_qty numeric NOT NULL DEFAULT 0,
    safety_stock numeric NOT NULL DEFAULT 0,
    last_counted_at timestamptz,
    last_counted_qty numeric,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(inventory_item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_item ON inventory_stock(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_location ON inventory_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_below_min ON inventory_stock(quantity, min_level) 
    WHERE quantity <= min_level;

-- Migrate existing inventory_records to inventory_items (if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
    INSERT INTO inventory_items (id, restaurant_id, name, category, unit_of_measure)
    SELECT 
      'item_' || menu_item_id,
      COALESCE(restaurant_id, 'default_restaurant'),
      COALESCE((SELECT name FROM menu_items WHERE id = menu_item_id LIMIT 1), menu_item_id),
      'Uncategorized',
      'unit'
    FROM inventory_records
    WHERE inventory_item_id IS NULL
    ON CONFLICT (id) DO NOTHING;
    
    -- Link inventory_records to inventory_items
    UPDATE inventory_records 
    SET inventory_item_id = 'item_' || menu_item_id
    WHERE inventory_item_id IS NULL;
  END IF;
END $$;

-- Create default location for each restaurant (if restaurants table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_locations') THEN
    INSERT INTO inventory_locations (id, restaurant_id, name, type, description)
    SELECT 
      'loc_default_' || id,
      id,
      'Main Storage',
      'warehouse',
      'Default storage location'
    FROM restaurants
    ON CONFLICT (id) DO NOTHING;
    
    -- Assign default location to inventory_records
    UPDATE inventory_records 
    SET location_id = 'loc_default_' || restaurant_id
    WHERE location_id IS NULL AND restaurant_id IS NOT NULL;
  END IF;
END $$;

-- Migrate inventory_records to inventory_stock (if both tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_stock') THEN
    INSERT INTO inventory_stock (id, restaurant_id, inventory_item_id, location_id, quantity, min_level, reorder_point, reorder_qty)
    SELECT 
      'stock_' || id,
      COALESCE(restaurant_id, 'default_restaurant'),
      inventory_item_id,
      location_id,
      COALESCE(stock, 0),
      COALESCE(low_stock_threshold, 0),
      COALESCE(reorder_point, 0),
      COALESCE(reorder_qty, 0)
    FROM inventory_records
    WHERE inventory_item_id IS NOT NULL
    ON CONFLICT (inventory_item_id, location_id) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      min_level = EXCLUDED.min_level,
      reorder_point = EXCLUDED.reorder_point,
      reorder_qty = EXCLUDED.reorder_qty,
      updated_at = NOW();
  END IF;
END $$;

-- Add unique constraint to recipe_ingredients if not exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_ingredients') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'recipe_ingredients_unique'
    ) THEN
      BEGIN
        ALTER TABLE recipe_ingredients
        ADD CONSTRAINT recipe_ingredients_unique 
        UNIQUE(restaurant_id, menu_item_id, inventory_item_id);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- Create inventory_alerts table if not exists  
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    alert_type text NOT NULL CHECK (alert_type IN (
        'low_stock', 'out_of_stock', 'expiring_soon', 'expired', 
        'below_par', 'overstock', 'count_variance', 'price_change'
    )),
    inventory_item_id text,
    location_id text,
    threshold_value numeric,
    current_value numeric,
    is_resolved boolean NOT NULL DEFAULT false,
    resolved_by text,
    resolved_at timestamptz,
    message text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_restaurant ON inventory_alerts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON inventory_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON inventory_alerts(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_alerts_item ON inventory_alerts(inventory_item_id);

-- Create stock_movements_enhanced table if not exists
CREATE TABLE IF NOT EXISTS stock_movements_enhanced (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL,
    from_location_id text,
    to_location_id text,
    movement_type text NOT NULL CHECK (movement_type IN (
        'purchase', 'sale', 'adjustment', 'waste', 'transfer', 
        'return', 'production', 'breakage', 'theft', 'count_variance'
    )),
    quantity numeric NOT NULL,
    quantity_before numeric NOT NULL,
    quantity_after numeric NOT NULL,
    unit_cost numeric,
    total_value numeric,
    lot_id text,
    reference_id text,
    reference_type text,
    performed_by text NOT NULL,
    notes text,
    timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_enhanced_item ON stock_movements_enhanced(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_location ON stock_movements_enhanced(from_location_id, to_location_id);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_type ON stock_movements_enhanced(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_timestamp ON stock_movements_enhanced(timestamp);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_ref ON stock_movements_enhanced(reference_id, reference_type);
