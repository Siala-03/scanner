-- Migration 071: secure OSDC device key storage with rotation metadata

CREATE TABLE IF NOT EXISTS device_keys (
  restaurant_id TEXT NOT NULL,
  tin TEXT NOT NULL,
  bhf_id TEXT NOT NULL,
  dvc_srl_no TEXT NOT NULL,
  cmc_key_enc TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, tin, bhf_id)
);

CREATE INDEX IF NOT EXISTS idx_device_keys_restaurant
  ON device_keys(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_device_keys_expires_at
  ON device_keys(expires_at);
