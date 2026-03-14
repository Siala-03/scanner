-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  price integer NOT NULL, -- stored in cents
  category text NOT NULL,
  emoji text DEFAULT '🍽️',
  prep_time integer DEFAULT 15, -- in minutes
  is_available boolean DEFAULT true,
  is_popular boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for faster category lookups
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);
