-- ============================================
-- ENABLE SUPABASE REALTIME PUBLICATION
-- Required for cross-device live order push to waiter/kitchen portals
-- ============================================

-- Add critical tables to the supabase_realtime publication so that
-- postgres_changes subscriptions work across browser sessions.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_records;

-- Also ensure the assigned_waiter_id column exists on orders
-- (the app reads `assigned_waiter_id`; the original schema used `assigned_to`)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_waiter_id text;

-- Back-fill from the existing assigned_to column where present
UPDATE orders SET assigned_waiter_id = assigned_to WHERE assigned_waiter_id IS NULL AND assigned_to IS NOT NULL;
