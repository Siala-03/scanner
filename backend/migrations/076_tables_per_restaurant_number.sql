-- Migration 076: Make table_number unique per restaurant, not globally
--
-- The original schema (006_tables.sql) had table_number UNIQUE globally.
-- After multi-tenancy was added (007), each restaurant should be able to
-- have its own table 1, 2, 3 ... N without colliding with other restaurants.
-- Drop the global constraint and replace it with a composite one.

-- Drop the global unique constraint on table_number
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_table_number_key;

-- Add per-restaurant uniqueness: each restaurant has its own number sequence
ALTER TABLE tables
  ADD CONSTRAINT tables_restaurant_table_number_unique
  UNIQUE (restaurant_id, table_number);
