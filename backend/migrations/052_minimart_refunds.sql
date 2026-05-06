-- Refunds issued by cashiers for minimart transactions

CREATE TABLE IF NOT EXISTS minimart_refunds (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      text,
  restaurant_id uuid        NOT NULL,
  refunded_by   text,
  refund_amount numeric(12,2) NOT NULL,
  reason        text        NOT NULL DEFAULT '',
  items         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minimart_refunds_restaurant ON minimart_refunds(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_minimart_refunds_order      ON minimart_refunds(order_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE minimart_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON minimart_refunds;
CREATE POLICY "tenant_isolation" ON minimart_refunds
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    restaurant_id::text = current_tenant_id()
    OR current_is_superadmin()
  )
  WITH CHECK (
    restaurant_id::text = current_tenant_id()
    OR current_is_superadmin()
  );
