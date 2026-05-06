-- Per-restaurant minimart configuration (tax rate, receipt footer, etc.)

CREATE TABLE IF NOT EXISTS minimart_settings (
  restaurant_id  uuid         PRIMARY KEY,
  tax_rate       numeric(5,2) NOT NULL DEFAULT 0,
  tax_label      text         NOT NULL DEFAULT 'Tax',
  receipt_footer text         NOT NULL DEFAULT '',
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE minimart_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON minimart_settings;
CREATE POLICY "tenant_isolation" ON minimart_settings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    restaurant_id::text = current_tenant_id()
    OR current_is_superadmin()
  )
  WITH CHECK (
    restaurant_id::text = current_tenant_id()
    OR current_is_superadmin()
  );
