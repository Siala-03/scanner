-- Credit Management System
-- Creates tables for managing customer credit accounts, transactions, applications, and alerts

-- Credit Accounts Table
-- Stores customer credit account information
CREATE TABLE IF NOT EXISTS credit_accounts (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL UNIQUE,
    credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_payment_date TIMESTAMPTZ,
    notes TEXT,
    restaurant_id TEXT DEFAULT 'default_restaurant'
);

-- Index for phone lookups (common search pattern)
CREATE INDEX IF NOT EXISTS idx_credit_accounts_phone ON credit_accounts(customer_phone);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_credit_accounts_status ON credit_accounts(status);

-- Index for restaurant_id (multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_credit_accounts_restaurant ON credit_accounts(restaurant_id);

-- Credit Account Transactions Table
-- Records all transactions (charges, payments, adjustments) for credit accounts
CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('charge', 'payment', 'adjustment')),
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    order_id TEXT, -- Optional link to an order
    description TEXT NOT NULL,
    performed_by TEXT, -- Staff ID who performed the transaction
    performed_by_name TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB -- Additional data like payment method, reference, etc.
);

-- Index for account transactions lookup
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account ON credit_transactions(account_id);

-- Index for timestamp ordering
CREATE INDEX IF NOT EXISTS idx_credit_transactions_timestamp ON credit_transactions(timestamp DESC);

-- Index for order_id link
CREATE INDEX IF NOT EXISTS idx_credit_transactions_order ON credit_transactions(order_id);

-- Credit Applications Table
-- Stores credit account applications that require manager approval
CREATE TABLE IF NOT EXISTS credit_applications (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    requested_limit DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by TEXT, -- Staff ID who submitted the application
    requested_by_name TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by TEXT, -- Staff ID who reviewed the application
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    rejection_reason TEXT
);

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_credit_applications_phone ON credit_applications(customer_phone);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_credit_applications_status ON credit_applications(status);

-- Index for pending applications
CREATE INDEX IF NOT EXISTS idx_credit_applications_pending ON credit_applications(requested_at) WHERE status = 'pending';

-- Credit Alerts Table
-- Stores automated alerts for credit account monitoring
CREATE TABLE IF NOT EXISTS credit_alerts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('overdue', 'limit_exceeded', 'suspended', 'payment_due')),
    message TEXT NOT NULL,
    amount DECIMAL(12,2), -- Optional amount related to alert
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT -- Staff ID who resolved the alert
);

-- Index for unresolved alerts
CREATE INDEX IF NOT EXISTS idx_credit_alerts_unresolved ON credit_alerts(is_resolved) WHERE is_resolved = FALSE;

-- Index for account alerts
CREATE INDEX IF NOT EXISTS idx_credit_alerts_account ON credit_alerts(account_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_credit_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_credit_accounts_updated_at
    BEFORE UPDATE ON credit_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_accounts_updated_at();

-- Insert default migration record
INSERT INTO schema_migrations (id) VALUES ('022_credit_management.sql')
ON CONFLICT (id) DO NOTHING;