-- ============================================
-- SET EXPENSE CURRENCY TO RWF
-- Normalizes expense-related currency defaults and existing rows
-- ============================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expenses'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'currency'
    ) THEN
      ALTER TABLE expenses
        ADD COLUMN currency text NOT NULL DEFAULT 'RWF';
    ELSE
      ALTER TABLE expenses
        ALTER COLUMN currency SET DEFAULT 'RWF';
    END IF;

    UPDATE expenses
    SET currency = 'RWF'
    WHERE currency IS NULL
       OR UPPER(currency) = 'USD'
       OR TRIM(currency) = '';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recurring_expenses'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recurring_expenses' AND column_name = 'currency'
    ) THEN
      ALTER TABLE recurring_expenses
        ADD COLUMN currency text NOT NULL DEFAULT 'RWF';
    ELSE
      ALTER TABLE recurring_expenses
        ALTER COLUMN currency SET DEFAULT 'RWF';
    END IF;

    UPDATE recurring_expenses
    SET currency = 'RWF'
    WHERE currency IS NULL
       OR UPPER(currency) = 'USD'
       OR TRIM(currency) = '';
  END IF;
END $$;

COMMIT;
