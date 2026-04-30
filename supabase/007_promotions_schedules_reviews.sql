-- Promotions table
CREATE TABLE IF NOT EXISTS promotions (
  id                text PRIMARY KEY,
  restaurant_id     text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  code              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('percentage', 'fixed')),
  discount_value    integer NOT NULL,
  min_order_amount  integer DEFAULT 0,
  max_uses          integer,
  uses_count        integer DEFAULT 0,
  valid_from        timestamptz NOT NULL,
  valid_until       timestamptz NOT NULL,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_code_restaurant ON promotions(restaurant_id, LOWER(code));
CREATE INDEX IF NOT EXISTS idx_promotions_restaurant ON promotions(restaurant_id);

-- Add promotion columns to orders if not present
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_id   text REFERENCES promotions(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_discount integer DEFAULT 0;

-- Staff schedules table
CREATE TABLE IF NOT EXISTS staff_schedules (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  staff_id      text NOT NULL,
  shift_date    date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  role          text,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_restaurant_date ON staff_schedules(restaurant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_schedules_staff ON staff_schedules(staff_id);

-- Reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id                 text PRIMARY KEY,
  restaurant_id      text NOT NULL REFERENCES restaurants(id),
  table_number       integer,
  customer_name      text NOT NULL,
  customer_phone     text NOT NULL,
  customer_email     text,
  party_size         integer NOT NULL,
  reservation_date   date NOT NULL,
  reservation_time   time NOT NULL,
  duration_minutes   integer DEFAULT 90,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
  notes              text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date ON reservations(restaurant_id, reservation_date);

-- Service reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  order_id      text,
  table_number  integer,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  customer_name text,
  waiter_id     text,
  waiter_name   text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON reviews(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_waiter ON reviews(waiter_id);

-- Menu item reviews table
CREATE TABLE IF NOT EXISTS menu_item_reviews (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  menu_item_id  text NOT NULL,
  order_id      text,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  customer_name text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mir_item ON menu_item_reviews(menu_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mir_restaurant ON menu_item_reviews(restaurant_id, created_at DESC);

-- Menu item modifiers column (if not present)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]';

-- Order item selected modifiers column (if not present)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_modifiers jsonb;
