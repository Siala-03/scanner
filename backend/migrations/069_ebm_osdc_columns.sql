-- Migration 069: OSDC compliance columns
-- Adds cmcKey (communication key) to ebm_config and osdc_invc_no (numeric invoice sequence) to ebm_invoices.
-- Required for RRA OSDC certification (TrnsSalesSaveWrReq).

ALTER TABLE ebm_config
  ADD COLUMN IF NOT EXISTS cmc_key TEXT;

ALTER TABLE ebm_invoices
  ADD COLUMN IF NOT EXISTS osdc_invc_no INTEGER;

COMMENT ON COLUMN ebm_config.cmc_key IS 'OSDC communication key for TrnsSalesSaveWrReq. Populated from selectInitInfo or device config.';
COMMENT ON COLUMN ebm_invoices.osdc_invc_no IS 'Monotonically increasing numeric invoice sequence required by OSDC (distinct from legacy string cisInvcNo).';

CREATE INDEX IF NOT EXISTS idx_ebm_invoices_osdc_invc_no
  ON ebm_invoices(restaurant_id, osdc_invc_no)
  WHERE osdc_invc_no IS NOT NULL;
