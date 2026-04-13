-- ============================================
-- SET RESTAURANT CURRENCY TO RWF
-- Updates existing restaurants and makes RWF the live DB default
-- ============================================

BEGIN;

-- Ensure future restaurants default to RWF
ALTER TABLE restaurants
  ALTER COLUMN currency SET DEFAULT 'RWF';

-- Normalize existing rows
UPDATE restaurants
SET currency = 'RWF'
WHERE currency IS NULL
   OR UPPER(currency) = 'USD'
   OR TRIM(currency) = '';

COMMIT;
