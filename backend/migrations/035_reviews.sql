CREATE TABLE IF NOT EXISTS reviews (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  order_id      text,
  table_number  integer,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  customer_name text,
  waiter_id     text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON reviews(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_waiter ON reviews(waiter_id);
