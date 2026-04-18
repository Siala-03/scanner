CREATE TABLE IF NOT EXISTS table_service_sessions (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  table_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'pending_close', 'closed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_printed_at TIMESTAMPTZ,
  pending_close_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_service_sessions_restaurant_table
  ON table_service_sessions (restaurant_id, table_number, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_table_service_sessions_pending_close
  ON table_service_sessions (status, pending_close_at)
  WHERE status = 'pending_close';
