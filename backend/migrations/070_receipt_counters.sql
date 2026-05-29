-- Migration 070: crash-safe sequential receipt counters for OSDC invoice numbering

CREATE TABLE IF NOT EXISTS receipt_counters (
  restaurant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  day TEXT NOT NULL,
  next_val INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, branch_id, day)
);

CREATE INDEX IF NOT EXISTS idx_receipt_counters_rest_branch
  ON receipt_counters (restaurant_id, branch_id);
