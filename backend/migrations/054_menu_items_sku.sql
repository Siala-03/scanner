-- Human-readable item code (SKU) for minimart products.
-- Separate from the internal `id` primary key — never changes the id.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sku text;

-- Unique per restaurant (two restaurants can share a code, but not within the same one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_sku_restaurant
  ON menu_items(restaurant_id, sku)
  WHERE sku IS NOT NULL;
