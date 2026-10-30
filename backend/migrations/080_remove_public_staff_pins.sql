-- Migration 080: Remove the old public copy of staff PIN hashes
--
-- Run ONLY after 079 has run AND the new frontend + staff-pin Edge Function are
-- live. Older app versions read PINs from restaurants.settings.staff_pins; once
-- that key is gone they would treat every waiter as having no PIN.

-- Pick up any PIN set through an old app version since 079 ran.
INSERT INTO staff_pins (staff_id, restaurant_id, pin_hash)
SELECT p.key, r.id::text, 'sha256$' || p.value
FROM restaurants r,
     jsonb_each_text(COALESCE(r.settings -> 'staff_pins', '{}'::jsonb)) AS p(key, value)
WHERE p.value ~ '^[0-9a-f]{64}$'
ON CONFLICT (staff_id) DO NOTHING;

UPDATE restaurants
SET settings = settings - 'staff_pins'
WHERE settings ? 'staff_pins';
