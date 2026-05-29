-- Migration 074: Record why an order was voided/cancelled
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN orders.cancel_reason IS 'Reason given by supervisor when directly voiding an order.';
