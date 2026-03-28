-- ============================================
-- EXPENSE APPROVAL WORKFLOW
-- Manage expense approvals from supervisors to managers
-- ============================================

-- ============================================
-- ALTER EXPENSES TABLE - ADD APPROVAL STATUS
-- ============================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'recalled'));

-- Add approval rejection reason
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add created by user role for context
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by_role text CHECK (created_by_role IN ('supervisor', 'manager', 'admin', 'owner'));

-- ============================================
-- CREATE EXPENSE AUDIT LOG TABLE
-- Track all changes to expenses including approvals
-- ============================================
CREATE TABLE IF NOT EXISTS expense_audit_log (
    id text PRIMARY KEY,
    expense_id text NOT NULL,
    restaurant_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('created', 'updated', 'submitted_for_approval', 'approved', 'rejected', 'recalled', 'paid')),
    performed_by text NOT NULL,
    performed_by_role text,
    previous_status text,
    new_status text,
    change_details jsonb, -- store what changed
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_audit_expense ON expense_audit_log(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_audit_performed_by ON expense_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_expense_audit_action ON expense_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_expense_audit_restaurant ON expense_audit_log(restaurant_id);

-- ============================================
-- CREATE RECEIPT TABLE
-- Store receipt file references and data
-- ============================================
CREATE TABLE IF NOT EXISTS expense_receipts (
    id text PRIMARY KEY,
    expense_id text NOT NULL UNIQUE,
    restaurant_id text NOT NULL,
    file_path text,
    file_url text,
    file_size integer,
    mime_type text,
    receipt_number text, -- unique receipt number for reference
    receipt_date date,
    generated_by text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense ON expense_receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_restaurant ON expense_receipts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_number ON expense_receipts(receipt_number);

-- ============================================
-- CREATE EXPENSE NOTES TABLE
-- Store messages/notes exchanged during approval process
-- ============================================
CREATE TABLE IF NOT EXISTS expense_notes (
    id text PRIMARY KEY,
    expense_id text NOT NULL,
    restaurant_id text NOT NULL,
    note_type text CHECK (note_type IN ('comment', 'rejection_reason', 'approval_note', 'system_note')),
    content text NOT NULL,
    created_by text NOT NULL,
    created_by_role text,
    created_by_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_notes_expense ON expense_notes(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_notes_type ON expense_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_expense_notes_created_by ON expense_notes(created_by);

-- ============================================
-- UPDATE EXISTING EXPENSES - SET APPROVAL STATUS
-- ============================================
UPDATE expenses SET approval_status = 'approved', created_by_role = 'supervisor' WHERE approval_status IS NULL;
