CREATE TABLE IF NOT EXISTS menu_item_reviews (
  id              text PRIMARY KEY,
  restaurant_id   text NOT NULL REFERENCES restaurants(id),
  menu_item_id    text NOT NULL,
  order_id        text,
  rating          integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  customer_name   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mir_item ON menu_item_reviews(menu_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mir_restaurant ON menu_item_reviews(restaurant_id, created_at DESC);
