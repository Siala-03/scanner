-- Add requires_kitchen to orders so kitchen display only shows food orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS requires_kitchen boolean NOT NULL DEFAULT false;

UPDATE orders
SET requires_kitchen = false
WHERE requires_kitchen IS NULL;
