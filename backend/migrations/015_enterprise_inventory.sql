-- ============================================
-- ENTERPRISE INVENTORY MANAGEMENT
-- For Hotels, Restaurants, and Bars
-- ============================================

-- ============================================
-- INVENTORY LOCATIONS
-- Multiple storage locations per restaurant
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_locations (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('warehouse', 'walk_in', 'dry_store', 'bar', 'kitchen', 'cold_room', 'freezer', 'display', 'other')),
    description text,
    is_active boolean NOT NULL DEFAULT true,
    capacity integer, -- maximum capacity in units
    temperature_range text, -- e.g., "2-4°C", "room temp", "-18°C"
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_restaurant ON inventory_locations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_locations_type ON inventory_locations(type);

-- ============================================
-- INVENTORY ITEMS (Master inventory items)
-- Separate from menu items for ingredients/raw materials
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_items (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    name text NOT NULL,
    sku text, -- stock keeping unit
    category text NOT NULL, -- e.g., "Beverages", "Produce", "Meat", "Dairy"
    sub_category text, -- e.g., "Red Wine", "Chicken", "Milk"
    unit_of_measure text NOT NULL DEFAULT 'unit', -- unit, kg, liter, case, box
    unit_conversion numeric DEFAULT 1, -- conversion to base unit
    is_tracked boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_items_sku ON inventory_items(sku);

-- ============================================
-- LOT/BATCH TRACKING
-- For expiry and FIFO management
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_lots (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    location_id text NOT NULL REFERENCES inventory_locations(id),
    lot_number text, -- supplier lot/batch number
    quantity numeric NOT NULL DEFAULT 0,
    unit_cost numeric NOT NULL DEFAULT 0,
    received_date date NOT NULL,
    expiry_date date,
    supplier_id text REFERENCES suppliers(id),
    purchase_order_id text REFERENCES purchase_orders(id),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lots_item ON inventory_lots(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_lots_location ON inventory_lots(location_id);
CREATE INDEX IF NOT EXISTS idx_lots_expiry ON inventory_lots(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lots_supplier ON inventory_lots(supplier_id);

-- ============================================
-- INVENTORY STOCK BY LOCATION
-- Current stock levels per item per location
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_stock (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    location_id text NOT NULL REFERENCES inventory_locations(id),
    quantity numeric NOT NULL DEFAULT 0,
    reserved_qty numeric NOT NULL DEFAULT 0, -- reserved for pending orders
    min_level numeric NOT NULL DEFAULT 0, -- par minimum / reorder point
    max_level numeric NOT NULL DEFAULT 0, -- par maximum
    reorder_point numeric NOT NULL DEFAULT 0,
    reorder_qty numeric NOT NULL DEFAULT 0,
    safety_stock numeric NOT NULL DEFAULT 0, -- buffer stock
    last_counted_at timestamptz,
    last_counted_qty numeric,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(inventory_item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_item ON inventory_stock(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_location ON inventory_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_below_min ON inventory_stock(quantity, min_level) 
    WHERE quantity <= min_level;

-- ============================================
-- PAR LEVELS
-- Define stock targets per location/item
-- ============================================
CREATE TABLE IF NOT EXISTS par_levels (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    location_id text NOT NULL REFERENCES inventory_locations(id),
    par_min numeric NOT NULL DEFAULT 0,
    par_max numeric NOT NULL DEFAULT 0,
    safety_stock numeric NOT NULL DEFAULT 0,
    reorder_point numeric NOT NULL DEFAULT 0,
    lead_time_days integer NOT NULL DEFAULT 3,
    auto_reorder boolean NOT NULL DEFAULT false,
    supplier_id text REFERENCES suppliers(id),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(inventory_item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_par_item ON par_levels(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_par_location ON par_levels(location_id);
CREATE INDEX IF NOT EXISTS idx_par_auto_reorder ON par_levels(auto_reorder) WHERE auto_reorder = true;

-- ============================================
-- RECIPE/INGREDIENT LINKING
-- Link inventory items to menu items with quantities
-- ============================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    menu_item_id text NOT NULL, -- references menu_items table
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    quantity numeric NOT NULL, -- quantity needed per serving
    unit_of_measure text NOT NULL DEFAULT 'unit',
    yield_percentage numeric DEFAULT 100, -- accounting for waste/loss
    is_optional boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_menu ON recipe_ingredients(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_item ON recipe_ingredients(inventory_item_id);

-- ============================================
-- STOCK MOVEMENTS (Enhanced)
-- Track all inventory movements with more detail
-- ============================================
CREATE TABLE IF NOT EXISTS stock_movements_enhanced (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    from_location_id text REFERENCES inventory_locations(id),
    to_location_id text REFERENCES inventory_locations(id),
    movement_type text NOT NULL CHECK (movement_type IN (
        'purchase', 'sale', 'adjustment', 'waste', 'transfer', 
        'return', 'production', 'breakage', 'theft', 'count_variance'
    )),
    quantity numeric NOT NULL,
    quantity_before numeric NOT NULL,
    quantity_after numeric NOT NULL,
    unit_cost numeric,
    total_value numeric,
    lot_id text REFERENCES inventory_lots(id),
    reference_id text, -- order_id, po_id, etc.
    reference_type text, -- 'order', 'purchase_order', 'stock_take'
    performed_by text NOT NULL,
    notes text,
    timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_enhanced_item ON stock_movements_enhanced(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_location ON stock_movements_enhanced(from_location_id, to_location_id);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_type ON stock_movements_enhanced(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_timestamp ON stock_movements_enhanced(timestamp);
CREATE INDEX IF NOT EXISTS idx_movements_enhanced_ref ON stock_movements_enhanced(reference_id, reference_type);

-- ============================================
-- WASTE TRACKING (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS waste_entries_enhanced (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    location_id text NOT NULL REFERENCES inventory_locations(id),
    quantity numeric NOT NULL,
    unit_cost numeric NOT NULL,
    total_cost numeric NOT NULL,
    reason text NOT NULL CHECK (reason IN (
        'expired', 'spoiled', 'damaged', 'overproduction', 'spillage', 
        'breakage', 'quality_rejected', 'menu_discontinued', 'other'
    )),
    lot_id text REFERENCES inventory_lots(id),
    reported_by text NOT NULL,
    recorded_by text NOT NULL,
    photos text[], -- array of photo URLs
    notes text,
    timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waste_enhanced_item ON waste_entries_enhanced(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_waste_enhanced_location ON waste_entries_enhanced(location_id);
CREATE INDEX IF NOT EXISTS idx_waste_enhanced_reason ON waste_entries_enhanced(reason);
CREATE INDEX IF NOT EXISTS idx_waste_enhanced_timestamp ON waste_entries_enhanced(timestamp);

-- ============================================
-- CYCLE COUNTS / STOCK TAKES
-- Scheduled inventory counting
-- ============================================
CREATE TABLE IF NOT EXISTS cycle_counts (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    location_id text REFERENCES inventory_locations(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    scheduled_date date NOT NULL,
    completed_date date,
    counted_by text,
    variance_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cycle_counts_restaurant ON cycle_counts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cycle_counts_status ON cycle_counts(status);
CREATE INDEX IF NOT EXISTS idx_cycle_counts_date ON cycle_counts(scheduled_date);

-- ============================================
-- CYCLE COUNT ITEMS
-- Individual items counted in a cycle count
-- ============================================
CREATE TABLE IF NOT EXISTS cycle_count_items (
    id text PRIMARY KEY,
    cycle_count_id text NOT NULL REFERENCES cycle_counts(id),
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    location_id text NOT NULL REFERENCES inventory_locations(id),
    system_qty numeric NOT NULL,
    counted_qty numeric,
    variance numeric, -- counted - system
    variance_reason text,
    counted_by text,
    counted_at timestamptz,
    verified_by text,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(cycle_count_id, inventory_item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_cycle_count_items_cycle ON cycle_count_items(cycle_count_id);
CREATE INDEX IF NOT EXISTS idx_cycle_count_items_variance ON cycle_count_items(variance) WHERE variance != 0;

-- ============================================
-- SUPPLIER PERFORMANCE TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS supplier_performance (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    supplier_id text NOT NULL REFERENCES suppliers(id),
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_orders integer NOT NULL DEFAULT 0,
    on_time_deliveries integer NOT NULL DEFAULT 0,
    partial_deliveries integer NOT NULL DEFAULT 0,
    missed_deliveries integer NOT NULL DEFAULT 0,
    total_value numeric NOT NULL DEFAULT 0,
    quality_issues integer NOT NULL DEFAULT 0,
    avg_delivery_time_hours numeric,
    rating numeric, -- 1-5 calculated
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(supplier_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_supplier_perf_supplier ON supplier_performance(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_perf_period ON supplier_performance(period_start, period_end);

-- ============================================
-- SUPPLIER PRICE HISTORY
-- Track price changes over time
-- ============================================
CREATE TABLE IF NOT EXISTS supplier_prices (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    supplier_id text NOT NULL REFERENCES suppliers(id),
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    unit_price numeric NOT NULL,
    minimum_order_qty numeric,
    effective_from date NOT NULL,
    effective_to date,
    is_current boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(supplier_id, inventory_item_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_supplier_prices_item ON supplier_prices(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier ON supplier_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_current ON supplier_prices(is_current) WHERE is_current = true;

-- ============================================
-- INVENTORY ALERTS
-- Configurable alerts and notifications
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    alert_type text NOT NULL CHECK (alert_type IN (
        'low_stock', 'out_of_stock', 'expiring_soon', 'expired', 
        'below_par', 'overstock', 'count_variance', 'price_change'
    )),
    inventory_item_id text REFERENCES inventory_items(id),
    location_id text REFERENCES inventory_locations(id),
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

-- ============================================
-- INVENTORY REPORTS CACHE
-- Pre-computed report data
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_reports (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    report_type text NOT NULL, -- 'stock_valuation', 'usage', 'waste', 'turnover'
    period_start date NOT NULL,
    period_end date NOT NULL,
    data jsonb NOT NULL,
    generated_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_restaurant ON inventory_reports(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON inventory_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_period ON inventory_reports(period_start, period_end);

-- ============================================
-- UPDATE EXISTING TABLES FOR RESTAURANT ID
-- ============================================

-- Add restaurant_id to existing inventory_tables if not present
-- This is handled by migration 007_multi_tenancy.sql for most tables

-- Add columns to existing tables if needed
ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS location_id text REFERENCES inventory_locations(id);
ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS lot_id text REFERENCES inventory_lots(id);
ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS restaurant_id text;

-- Add columns to purchase orders for enhanced tracking
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_arrival_time time;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS actual_arrival_time time;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quality_check_passed boolean;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quality_notes text;

-- Add columns to suppliers for enterprise features
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_branch text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms_days integer DEFAULT 30;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS minimum_order_value numeric DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contract_start date;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contract_end date;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_preferred boolean DEFAULT false;