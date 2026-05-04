-- EBM (Electronic Billing Machine) / VSDC fiscal integration tables

CREATE TABLE IF NOT EXISTS ebm_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id TEXT NOT NULL UNIQUE,
  tpin TEXT NOT NULL,
  bhf_id TEXT NOT NULL DEFAULT '000',
  dvc_srl_no TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'http://localhost:8088',
  env TEXT NOT NULL DEFAULT 'sandbox' CHECK (env IN ('sandbox', 'production')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_req_dt TEXT,
  initialized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ebm_invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  restaurant_id TEXT NOT NULL,
  order_id TEXT,
  invoice_type TEXT NOT NULL DEFAULT 'S' CHECK (invoice_type IN ('S', 'R', 'T')),
  cis_invc_no TEXT NOT NULL,
  org_invc_no TEXT,
  rcpt_no INTEGER,
  intrl_data TEXT,
  rcpt_sign TEXT,
  sdc_id TEXT,
  tot_rcpt_no INTEGER,
  cust_tin TEXT,
  cust_nm TEXT,
  pmt_ty_cd TEXT,
  tot_amt NUMERIC(15,2) NOT NULL,
  tot_taxbl_amt NUMERIC(15,2),
  tot_tax_amt NUMERIC(15,2),
  raw_request JSONB,
  raw_response JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_msg TEXT,
  fiscalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebm_invoices_restaurant ON ebm_invoices(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ebm_invoices_order ON ebm_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_ebm_invoices_status ON ebm_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ebm_invoices_created ON ebm_invoices(created_at DESC);

-- Add EBM columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ebm_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS ebm_rcpt_sign TEXT,
  ADD COLUMN IF NOT EXISTS ebm_rcpt_no INTEGER,
  ADD COLUMN IF NOT EXISTS ebm_fiscalized_at TIMESTAMPTZ;
