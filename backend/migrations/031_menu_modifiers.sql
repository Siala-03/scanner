ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_modifiers jsonb DEFAULT '[]';
