-- Add requires_kitchen to menu_items so kitchen routing can be explicitly set per item.
-- When true: item is prepared by kitchen. When false: bar/counter only.
-- If NULL: falls back to category-based detection on the frontend.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS requires_kitchen boolean DEFAULT NULL;
