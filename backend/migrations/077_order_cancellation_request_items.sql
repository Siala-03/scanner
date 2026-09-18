-- Migration 077: Item-level order cancellation requests
--
-- Previously a cancellation request always targeted the whole order — approving
-- one cancelled every item on it, regardless of the "round" a waiter picked in
-- the UI. This adds item_ids so a request can target specific items instead.
--
-- Backward compatible: existing rows default to item_ids = '[]', which the
-- application treats as "whole order" (the original behavior).

ALTER TABLE order_cancellation_requests
  ADD COLUMN IF NOT EXISTS item_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
