CREATE TABLE IF NOT EXISTS reservations (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number integer,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  party_size integer NOT NULL,
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  duration_minutes integer DEFAULT 90,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date ON reservations(restaurant_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(restaurant_id, status);
