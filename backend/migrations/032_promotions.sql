CREATE TABLE IF NOT EXISTS promotions (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('percentage', 'fixed')),
  discount_value integer NOT NULL,
  min_order_amount integer DEFAULT 0,
  max_uses integer,
  uses_count integer DEFAULT 0,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_code_restaurant ON promotions(restaurant_id, LOWER(code));
CREATE INDEX IF NOT EXISTS idx_promotions_restaurant ON promotions(restaurant_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_id text REFERENCES promotions(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_discount integer DEFAULT 0;
