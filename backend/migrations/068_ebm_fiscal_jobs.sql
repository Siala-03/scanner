-- Queue-based, idempotent EBM fiscalization safeguards with RLS tenant isolation

ALTER TABLE ebm_invoices
  ADD COLUMN IF NOT EXISTS fiscal_intent_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ebm_invoices_fiscal_intent_key
  ON ebm_invoices(fiscal_intent_key)
  WHERE fiscal_intent_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ebm_invoices_success_sales_per_order
  ON ebm_invoices(order_id, invoice_type)
  WHERE status = 'success' AND invoice_type = 'S';

CREATE TABLE IF NOT EXISTS ebm_fiscal_jobs (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'S' CHECK (invoice_type IN ('S', 'R', 'T')),
  payment_type TEXT,
  cust_tin TEXT,
  intent_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'needs_review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  result_invoice_id TEXT,
  last_error TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ebm_fiscal_jobs_intent_key
  ON ebm_fiscal_jobs(intent_key);

CREATE INDEX IF NOT EXISTS idx_ebm_fiscal_jobs_status_retry
  ON ebm_fiscal_jobs(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_ebm_fiscal_jobs_order
  ON ebm_fiscal_jobs(order_id, invoice_type);

-- ── Optional RLS Policies (only for Supabase environments with auth schema) ──────────

-- If this is Supabase, RLS policies will be created separately via the 046_tenant_rls script
-- For development environments without auth schema, this table can be accessed directly
