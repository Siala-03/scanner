-- Migration 056: Minimart refund requests (manager approval workflow)
-- Cashiers submit refund requests; managers approve or deny them.
-- Approved requests then trigger the actual refund via minimart_refunds.
--
-- All ID columns are TEXT (no FK constraints) because restaurants.id,
-- staff.id, and orders.id are all TEXT in this schema.

CREATE TABLE IF NOT EXISTS minimart_refund_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    TEXT        NOT NULL,
  order_id         TEXT,
  order_number     TEXT,
  requested_by     TEXT,
  cashier_name     TEXT,
  refund_amount    NUMERIC(12, 2) NOT NULL,
  reason           TEXT        NOT NULL DEFAULT '',
  items            JSONB,
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  review_notes     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_restaurant
  ON minimart_refund_requests (restaurant_id, status, created_at DESC);

-- RLS
ALTER TABLE minimart_refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "minimart_refund_requests_insert" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_select" ON minimart_refund_requests;
DROP POLICY IF EXISTS "minimart_refund_requests_update" ON minimart_refund_requests;

CREATE POLICY "minimart_refund_requests_insert"
  ON minimart_refund_requests FOR INSERT
  WITH CHECK (
    restaurant_id = current_tenant_id()
    OR current_is_superadmin()
  );

CREATE POLICY "minimart_refund_requests_select"
  ON minimart_refund_requests FOR SELECT
  USING (
    restaurant_id = current_tenant_id()
    OR current_is_superadmin()
  );

CREATE POLICY "minimart_refund_requests_update"
  ON minimart_refund_requests FOR UPDATE
  USING (
    restaurant_id = current_tenant_id()
    OR current_is_superadmin()
  );
