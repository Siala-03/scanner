CREATE TABLE IF NOT EXISTS staff_schedules (
  id          text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  staff_id    text NOT NULL,
  shift_date  date NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  role        text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_restaurant_date ON staff_schedules(restaurant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_schedules_staff ON staff_schedules(staff_id);
