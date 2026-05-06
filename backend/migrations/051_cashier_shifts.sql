-- Cashier shift management for minimart POS
-- Tracks open/close times, opening float, till reconciliation, and sales summary

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid        NOT NULL,
  cashier_id          text,
  cashier_name        text        NOT NULL DEFAULT '',
  opened_at           timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,
  opening_float       numeric(12,2) NOT NULL DEFAULT 0,
  closing_float       numeric(12,2),
  expected_cash       numeric(12,2),
  cash_variance       numeric(12,2),
  total_sales         numeric(12,2) DEFAULT 0,
  total_transactions  integer       DEFAULT 0,
  status              text        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'closed')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_restaurant ON cashier_shifts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier    ON cashier_shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_status     ON cashier_shifts(status);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON cashier_shifts;
CREATE POLICY "tenant_isolation" ON cashier_shifts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    restaurant_id::text = current_tenant_id()
    OR current_is_superadmin()
  )
  WITH CHECK (
    restaurant_id::text = current_tenant_id()
    OR current_is_superadmin()
  );
