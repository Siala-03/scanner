-- ============================================
-- EXPENSE MANAGEMENT SYSTEM
-- Track and manage all business expenses
-- ============================================

-- ============================================
-- EXPENSE CATEGORIES
-- Organize expenses by category
-- ============================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#6366f1', -- hex color for UI
    icon text DEFAULT 'receipt', -- icon name for UI
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_restaurant ON expense_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(is_active);

-- ============================================
-- EXPENSES
-- Main expense records
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    category_id text NOT NULL,
    vendor_name text, -- supplier or vendor name
    description text NOT NULL,
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency text NOT NULL DEFAULT 'USD',
    expense_date date NOT NULL,
    payment_method text CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'other')),
    payment_status text NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'partially_paid', 'overdue', 'cancelled')),
    reference_number text, -- invoice number, receipt number, etc.
    notes text,
    is_recurring boolean NOT NULL DEFAULT false,
    recurring_frequency text CHECK (recurring_frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    recurring_end_date date,
    tax_amount numeric(12,2) DEFAULT 0,
    tax_rate numeric(5,2) DEFAULT 0, -- percentage
    is_tax_deductible boolean NOT NULL DEFAULT false,
    approved_by text, -- user id who approved
    approved_at timestamptz,
    created_by text NOT NULL, -- user id who created
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_restaurant ON expenses(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_status ON expenses(payment_status);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(is_recurring);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);

-- ============================================
-- RECURRING EXPENSES
-- Track recurring expense schedules
-- ============================================
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    category_id text NOT NULL,
    vendor_name text,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency text NOT NULL DEFAULT 'USD',
    frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    start_date date NOT NULL,
    end_date date,
    next_due_date date NOT NULL,
    payment_method text CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'other')),
    auto_generate boolean NOT NULL DEFAULT false, -- auto-create expense records
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_restaurant ON recurring_expenses(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category ON recurring_expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next_due ON recurring_expenses(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(is_active);

-- ============================================
-- EXPENSE ATTACHMENTS
-- Store receipts and documents
-- ============================================
CREATE TABLE IF NOT EXISTS expense_attachments (
    id text PRIMARY KEY,
    expense_id text NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text, -- mime type
    file_size integer, -- in bytes
    uploaded_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON expense_attachments(expense_id);

-- ============================================
-- EXPENSE BUDGETS
-- Track budget limits by category
-- ============================================
CREATE TABLE IF NOT EXISTS expense_budgets (
    id text PRIMARY KEY,
    restaurant_id text NOT NULL,
    category_id text NOT NULL,
    budget_amount numeric(12,2) NOT NULL CHECK (budget_amount >= 0),
    period_type text NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    start_date date NOT NULL,
    end_date date NOT NULL,
    alert_threshold numeric(5,2) DEFAULT 80, -- percentage to trigger alert
    is_active boolean NOT NULL DEFAULT true,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, category_id, period_type, start_date)
);

CREATE INDEX IF NOT EXISTS idx_expense_budgets_restaurant ON expense_budgets(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_budgets_category ON expense_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_budgets_period ON expense_budgets(period_type, start_date);

-- ============================================
-- INSERT DEFAULT EXPENSE CATEGORIES
-- ============================================
INSERT INTO expense_categories (id, restaurant_id, name, description, color, icon) VALUES
    ('cat_rent', 'default', 'Rent & Lease', 'Monthly rent, lease payments', '#ef4444', 'building'),
    ('cat_utilities', 'default', 'Utilities', 'Electricity, water, gas, internet', '#f59e0b', 'zap'),
    ('cat_payroll', 'default', 'Payroll', 'Employee salaries and wages', '#10b981', 'users'),
    ('cat_supplies', 'default', 'Supplies', 'Office and operational supplies', '#3b82f6', 'package'),
    ('cat_maintenance', 'default', 'Maintenance', 'Equipment and facility maintenance', '#8b5cf6', 'wrench'),
    ('cat_marketing', 'default', 'Marketing', 'Advertising and promotions', '#ec4899', 'megaphone'),
    ('cat_insurance', 'default', 'Insurance', 'Business insurance premiums', '#06b6d4', 'shield'),
    ('cat_taxes', 'default', 'Taxes', 'Business taxes and fees', '#84cc16', 'receipt'),
    ('cat_professional', 'default', 'Professional Services', 'Legal, accounting, consulting', '#f97316', 'briefcase'),
    ('cat_miscellaneous', 'default', 'Miscellaneous', 'Other business expenses', '#6b7280', 'more-horizontal')
ON CONFLICT DO NOTHING;
