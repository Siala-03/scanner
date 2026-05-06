-- Migration 055: Remove stuck menu items that cannot be edited or deleted via the UI
-- Deletes "African Tea" and "BIG FANTA" and their associated inventory records.
-- Runs as service role (bypasses RLS).

-- 1. Remove any inventory_records rows linked to these menu items
DELETE FROM inventory_records
WHERE menu_item_id IN (
  SELECT id FROM menu_items WHERE name IN ('African Tea', 'BIG FANTA')
);

-- 2. Remove associated stock movements (no FK constraint, just clean up)
DELETE FROM stock_movements
WHERE menu_item_id IN (
  SELECT id FROM menu_items WHERE name IN ('African Tea', 'BIG FANTA')
);

-- 3. Remove associated waste entries
DELETE FROM waste_entries
WHERE menu_item_id IN (
  SELECT id FROM menu_items WHERE name IN ('African Tea', 'BIG FANTA')
);

-- 4. Delete the menu items themselves
DELETE FROM menu_items
WHERE name IN ('African Tea', 'BIG FANTA');
