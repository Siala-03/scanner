-- Migration 079: Move staff PINs out of public restaurant settings
--
-- PINs were stored as unsalted SHA-256 hashes in restaurants.settings.staff_pins.
-- That column is readable by anyone with the public anon key (and is returned
-- by the public restaurants endpoint), and a 4-digit PIN's SHA-256 is cracked
-- instantly. This table is server-only: RLS is on with NO policies, so only
-- the staff-pin Edge Function (service role) can read or write it.
--
-- Existing PINs are copied as 'sha256$<hex>' so nobody has to re-enter them;
-- the Edge Function re-hashes each one (salted PBKDF2) on its next successful use.
--
-- Run 080 only AFTER the new frontend and the staff-pin function are deployed.

CREATE TABLE IF NOT EXISTS staff_pins (
  staff_id        text PRIMARY KEY,
  restaurant_id   text NOT NULL,
  pin_hash        text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_pins_restaurant_idx ON staff_pins (restaurant_id);

ALTER TABLE staff_pins ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: anon/authenticated get no access.

INSERT INTO staff_pins (staff_id, restaurant_id, pin_hash)
SELECT p.key, r.id::text, 'sha256$' || p.value
FROM restaurants r,
     jsonb_each_text(COALESCE(r.settings -> 'staff_pins', '{}'::jsonb)) AS p(key, value)
WHERE p.value ~ '^[0-9a-f]{64}$'
ON CONFLICT (staff_id) DO NOTHING;
