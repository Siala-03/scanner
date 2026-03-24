-- ============================================
-- Added loyalty reward fields to orders
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS loyalty_reward_id text REFERENCES rewards(id),
  ADD COLUMN IF NOT EXISTS loyalty_discount integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_free_item_id text;

CREATE INDEX IF NOT EXISTS idx_orders_loyalty_reward_id ON orders(loyalty_reward_id);
