-- ============================================
-- ADD MISSING LOYALTY COLUMNS TO CUSTOMERS TABLE
-- ============================================

-- Add last_visit column if it doesn't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit timestamptz;

-- Add visit_count column if it doesn't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count integer NOT NULL DEFAULT 0;

-- Add restaurant_id column if it doesn't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS restaurant_id text DEFAULT 'default_restaurant' REFERENCES restaurants(id);

-- Update restaurant_id for existing records if NULL
UPDATE customers SET restaurant_id = 'default_restaurant' WHERE restaurant_id IS NULL;

-- Add index for last_visit to improve ordering performance
CREATE INDEX IF NOT EXISTS idx_customers_last_visit ON customers(last_visit DESC NULLS LAST);

-- Add index for restaurant_id to support filtering
CREATE INDEX IF NOT EXISTS idx_customers_restaurant_id ON customers(restaurant_id);
