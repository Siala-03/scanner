-- ============================================
-- ADD RESTAURANT_ID TO INVENTORY_RECORDS
-- ============================================

-- Check if inventory_records table exists and add restaurant_id column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_records') THEN
    ALTER TABLE inventory_records
    ADD COLUMN IF NOT EXISTS restaurant_id text DEFAULT 'default_restaurant';
    
    -- Create index for restaurant queries
    CREATE INDEX IF NOT EXISTS idx_inventory_records_restaurant 
    ON inventory_records(restaurant_id);
    
    -- Drop old unique index if it exists and create new one with restaurant_id
    BEGIN
      DROP INDEX IF EXISTS idx_inventory_records_unique;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_records_unique 
    ON inventory_records(menu_item_id, restaurant_id);
    
    -- Seed initial inventory records from menu_items (if they don't exist)
    -- Only insert if table exists and has data
    IF EXISTS (SELECT 1 FROM menu_items LIMIT 1) THEN
      INSERT INTO inventory_records (id, menu_item_id, stock, low_stock_threshold, reorder_point, reorder_qty, unit_cost, restaurant_id, created_at, updated_at)
      SELECT 
        'inv_' || m.id,
        m.id,
        100 as stock,
        10 as low_stock_threshold,
        20 as reorder_point,
        50 as reorder_qty,
        CASE 
          WHEN m.price > 20000 THEN 1000
          WHEN m.price > 10000 THEN 500
          ELSE 200
        END as unit_cost,
        'default_restaurant' as restaurant_id,
        NOW(),
        NOW()
      FROM menu_items m
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_records ir 
        WHERE ir.menu_item_id = m.id 
        AND ir.restaurant_id = 'default_restaurant'
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END IF;
END $$;
