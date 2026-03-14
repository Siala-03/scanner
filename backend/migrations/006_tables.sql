-- Tables for restaurant
CREATE TABLE IF NOT EXISTS tables (
  id text PRIMARY KEY,
  table_number integer NOT NULL UNIQUE,
  name text DEFAULT '',
  capacity integer DEFAULT 4,
  location text DEFAULT 'Main',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tables_number ON tables(table_number);
