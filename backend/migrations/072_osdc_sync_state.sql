-- Migration 072: incremental OSDC sync state tracker

CREATE TABLE IF NOT EXISTS sync_state (
  restaurant_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  last_req_dt TEXT NOT NULL DEFAULT '20000101000000',
  last_result_cd TEXT,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_sync_state_endpoint
  ON sync_state(endpoint);

CREATE INDEX IF NOT EXISTS idx_sync_state_last_synced
  ON sync_state(last_synced_at DESC);
