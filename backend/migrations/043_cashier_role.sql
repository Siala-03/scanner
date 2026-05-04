-- Migration 043: Add 'cashier' role to staff table
-- Minimart outlets use 'cashier' instead of 'waiter' to distinguish POS staff

-- Drop the existing role check constraint and recreate with cashier included
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;

ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('waiter', 'cashier', 'supervisor', 'manager', 'kitchen', 'superadmin'));
