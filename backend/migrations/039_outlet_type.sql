-- Migration 039: outlet_type on restaurants
-- Enables different outlet modes (restaurant, bar, minimart, hotel, cafe)
-- per business unit. The outlet_type drives which UI the staff sees after login.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS outlet_type TEXT NOT NULL DEFAULT 'restaurant'
    CHECK (outlet_type IN ('restaurant', 'bar', 'minimart', 'hotel', 'cafe'));

-- Index for superadmin listing by type
CREATE INDEX IF NOT EXISTS idx_restaurants_outlet_type ON restaurants(outlet_type);

-- Back-fill existing rows (all existing outlets are restaurant or bar; default 'restaurant' is safe)
-- Superadmin can update individual rows via the dashboard.
