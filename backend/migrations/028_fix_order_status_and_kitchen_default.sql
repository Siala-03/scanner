-- ============================================================
-- Fix 1: Add 'verified' to the orders status constraint.
--
-- The waiter dashboard sets status = 'verified' when sending
-- a food order to the kitchen.  The original constraint only
-- listed ('pending','preparing','ready','served','cancelled'),
-- so every 'verified' update was silently rejected by Postgres,
-- leaving the order stuck as 'pending' and invisible to the
-- kitchen display.
-- ============================================================

-- Drop the old constraint (auto-named by Postgres as orders_status_check).
-- We use a DO block so the script is safe to re-run.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM   pg_constraint
  WHERE  conrelid = 'orders'::regclass
    AND  contype  = 'c'
    AND  conname  LIKE '%status%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'verified', 'preparing', 'ready', 'served', 'cancelled'));

-- ============================================================
-- Fix 2: Change requires_kitchen default from false → true.
--
-- Migration 021 added requires_kitchen with DEFAULT false, so
-- any order row inserted without an explicit value was flagged
-- as non-kitchen and filtered out of the kitchen display.
-- Food orders are the common case, so the safe default is true.
-- ============================================================

ALTER TABLE orders
  ALTER COLUMN requires_kitchen SET DEFAULT true;

-- Back-fill active orders that were incorrectly set to false
-- because they were inserted before this fix.  Only touch rows
-- that are still in-flight (not yet served/cancelled).
UPDATE orders
SET    requires_kitchen = true
WHERE  requires_kitchen = false
  AND  status IN ('pending', 'verified', 'preparing', 'ready');
