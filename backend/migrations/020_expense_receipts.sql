-- ============================================
-- EXPENSE RECEIPTS AND AUDIT LOG
-- Support receipt generation and tracking
-- ============================================

-- Expense Receipts Table
CREATE TABLE IF NOT EXISTS expense_receipts (
    id text PRIMARY KEY,
    expense_id text NOT NULL,
    restaurant_id text NOT NULL,
    receipt_number text NOT NULL,
    receipt_date date NOT NULL,
    generated_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(restaurant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense ON expense_receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_restaurant ON expense_receipts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_date ON expense_receipts(receipt_date);

-- Expense Notes Table
CREATE TABLE IF NOT EXISTS expense_notes (
    id text PRIMARY KEY,
    expense_id text NOT NULL,
    restaurant_id text NOT NULL,
    note_type text CHECK (note_type IN ('comment', 'internal', 'approval', 'rejection')),
    content text NOT NULL,
    created_by text NOT NULL,
    created_by_role text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_notes_expense ON expense_notes(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_notes_restaurant ON expense_notes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_notes_type ON expense_notes(note_type);

-- Expense Audit Log Table
CREATE TABLE IF NOT EXISTS expense_audit_log (
    id text PRIMARY KEY,
    expense_id text NOT NULL,
    restaurant_id text NOT NULL,
    action text NOT NULL,
    performed_by text NOT NULL,
    performed_by_role text,
    previous_status text,
    new_status text,
    change_details jsonb,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_audit_log_expense ON expense_audit_log(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_audit_log_restaurant ON expense_audit_log(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_audit_log_action ON expense_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_expense_audit_log_created_at ON expense_audit_log(created_at);
