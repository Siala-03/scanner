-- Add category column to inventory_records
-- This allows inventory items to have their own categorization separate from menu items
-- Menu categories come from menu_items.category and are filtered by requires_kitchen

ALTER TABLE inventory_records
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';
