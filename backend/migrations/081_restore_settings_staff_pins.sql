-- Migration 081: Restore staff PINs to restaurants.settings (temporary rollback)
--
-- The app is back on the settings-based PIN check until the staff-pin Edge
-- Function is deployed. If 080 already removed settings.staff_pins, this copies
-- every PIN back from staff_pins (where 079 saved them). Safe to run even if
-- 080 never ran: PINs already in settings are kept as they are.

UPDATE restaurants r
SET settings = COALESCE(r.settings, '{}'::jsonb)
  || jsonb_build_object(
       'staff_pins',
       src.pins || COALESCE(r.settings -> 'staff_pins', '{}'::jsonb)
     )
FROM (
  SELECT restaurant_id, jsonb_object_agg(staff_id, substring(pin_hash FROM 8)) AS pins
  FROM staff_pins
  WHERE pin_hash LIKE 'sha256$%'
  GROUP BY restaurant_id
) src
WHERE r.id::text = src.restaurant_id;

-- Check: how many PINs each restaurant now has in settings
SELECT name, (SELECT count(*) FROM jsonb_object_keys(COALESCE(settings -> 'staff_pins', '{}'::jsonb))) AS pins
FROM restaurants
ORDER BY pins DESC;
