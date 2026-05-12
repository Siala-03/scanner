-- Migration 067: Manager approval workflow for order cancellation requests

CREATE TABLE IF NOT EXISTS order_cancellation_requests (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  restaurant_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason text,
  requested_by text,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_order_cancellation_request_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_cancel_requests_restaurant
  ON order_cancellation_requests(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_order_cancel_requests_order
  ON order_cancellation_requests(order_id);

CREATE INDEX IF NOT EXISTS idx_order_cancel_requests_status
  ON order_cancellation_requests(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_cancel_requests_pending_order
  ON order_cancellation_requests(order_id)
  WHERE status = 'pending';

ALTER TABLE order_cancellation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_cancellation_requests_all" ON order_cancellation_requests;
CREATE POLICY "order_cancellation_requests_all" ON order_cancellation_requests
  AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
