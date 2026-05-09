-- ============================================================
-- Normalize expense monetary fields to decimals.
-- Fixes errors like: invalid input syntax for type integer: "273875.95"
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'amount'
  ) THEN
    EXECUTE 'ALTER TABLE expenses ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'tax_amount'
  ) THEN
    EXECUTE 'ALTER TABLE expenses ALTER COLUMN tax_amount TYPE numeric(12,2) USING tax_amount::numeric(12,2)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'tax_rate'
  ) THEN
    EXECUTE 'ALTER TABLE expenses ALTER COLUMN tax_rate TYPE numeric(5,2) USING tax_rate::numeric(5,2)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recurring_expenses' AND column_name = 'amount'
  ) THEN
    EXECUTE 'ALTER TABLE recurring_expenses ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expense_budgets' AND column_name = 'budget_amount'
  ) THEN
    EXECUTE 'ALTER TABLE expense_budgets ALTER COLUMN budget_amount TYPE numeric(12,2) USING budget_amount::numeric(12,2)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expense_budgets' AND column_name = 'alert_threshold'
  ) THEN
    EXECUTE 'ALTER TABLE expense_budgets ALTER COLUMN alert_threshold TYPE numeric(5,2) USING alert_threshold::numeric(5,2)';
  END IF;
END $$;
