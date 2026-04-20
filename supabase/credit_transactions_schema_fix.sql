-- Servv credit schema compatibility fix
-- Safe to run multiple times in Supabase SQL Editor

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure id auto-generates if omitted by any client
ALTER TABLE public.credit_transactions
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Ensure compatibility columns exist across old/new client payloads
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS performed_by text,
  ADD COLUMN IF NOT EXISTS performed_by_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS timestamp timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS restaurant_id text DEFAULT 'default_restaurant',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Keep important columns populated for legacy readers
UPDATE public.credit_transactions
SET created_at = COALESCE(created_at, timestamp, now())
WHERE created_at IS NULL;

UPDATE public.credit_transactions
SET timestamp = COALESCE(timestamp, created_at, now())
WHERE timestamp IS NULL;

UPDATE public.credit_transactions
SET description = COALESCE(description, notes, 'Credit transaction')
WHERE description IS NULL;

UPDATE public.credit_transactions
SET notes = COALESCE(notes, description, '')
WHERE notes IS NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id
  ON public.credit_transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at
  ON public.credit_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_timestamp
  ON public.credit_transactions(timestamp DESC);

COMMIT;
