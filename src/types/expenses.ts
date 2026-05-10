// ============================================
// EXPENSE MANAGEMENT - TYPES
// ============================================

// ── Expense Categories ──────────────────────────────────────────────────────
export interface ExpenseCategory {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  color: string; // hex color for UI
  icon: string; // icon name for UI
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Payment Methods ─────────────────────────────────────────────────────────
export type PaymentMethod = 
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'check'
  | 'other';

// ── Payment Status ──────────────────────────────────────────────────────────
export type PaymentStatus = 
  | 'pending'
  | 'paid'
  | 'partially_paid'
  | 'overdue'
  | 'cancelled';

// ── Recurring Frequency ─────────────────────────────────────────────────────
export type RecurringFrequency = 
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

// ── Approval Status ─────────────────────────────────────────────────────────
export type ApprovalStatus = 
  | 'pending'
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'recalled'
  | 'reimbursed';

// ── User Role ───────────────────────────────────────────────────────────────
export type UserRole = 
  | 'supervisor'
  | 'manager'
  | 'admin'
  | 'owner';

// ── Expenses ────────────────────────────────────────────────────────────────
export interface Expense {
  id: string;
  restaurantId: string;
  categoryId: string;
  vendorName?: string;
  description: string;
  amount: number;
  currency: string;
  expenseDate: string; // ISO date
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  referenceNumber?: string; // invoice number, receipt number, etc.
  notes?: string;
  isRecurring: boolean;
  recurringFrequency?: RecurringFrequency;
  recurringEndDate?: string; // ISO date
  taxAmount: number;
  taxRate: number; // percentage
  isTaxDeductible: boolean;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  approvedBy?: string; // user id who approved
  approvedAt?: string; // ISO timestamp
  createdBy: string; // user id who created
  createdByName?: string;
  createdByRole?: UserRole;
  createdAt: string;
  updatedAt: string;
  // Joined data
  category?: ExpenseCategory;
  receipt?: ExpenseReceipt;
  notes_?: ExpenseNote[];
  auditLog?: ExpenseAuditLog[];
}

// ── Recurring Expenses ──────────────────────────────────────────────────────
export interface RecurringExpense {
  id: string;
  restaurantId: string;
  categoryId: string;
  vendorName?: string;
  description: string;
  amount: number;
  currency: string;
  frequency: RecurringFrequency;
  startDate: string; // ISO date
  endDate?: string; // ISO date
  nextDueDate: string; // ISO date
  paymentMethod?: PaymentMethod;
  autoGenerate: boolean; // auto-create expense records
  isActive: boolean;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Joined data
  category?: ExpenseCategory;
}

// ── Expense Attachments ─────────────────────────────────────────────────────
export interface ExpenseAttachment {
  id: string;
  expenseId: string;
  fileName: string;
  fileUrl: string;
  fileType?: string; // mime type
  fileSize?: number; // in bytes
  uploadedBy: string;
  createdAt: string;
}

// ── Expense Receipt ─────────────────────────────────────────────────────────
export interface ExpenseReceipt {
  id: string;
  expenseId: string;
  restaurantId: string;
  filePath?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  receiptNumber: string; // unique receipt number
  receiptDate?: string; // ISO date
  generatedBy: string; // user id
  generatedAt: string; // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

// ── Expense Note ────────────────────────────────────────────────────────────
export type ExpenseNoteType = 'comment' | 'rejection_reason' | 'approval_note' | 'system_note';

export interface ExpenseNote {
  id: string;
  expenseId: string;
  restaurantId: string;
  noteType: ExpenseNoteType;
  content: string;
  createdBy: string;
  createdByRole?: UserRole;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Expense Audit Log ───────────────────────────────────────────────────────
export type ExpenseAuditAction = 'created' | 'updated' | 'submitted_for_approval' | 'approved' | 'rejected' | 'recalled' | 'paid';

export interface ExpenseAuditLog {
  id: string;
  expenseId: string;
  restaurantId: string;
  action: ExpenseAuditAction;
  performedBy: string;
  performedByRole?: UserRole;
  previousStatus?: ApprovalStatus;
  newStatus?: ApprovalStatus;
  changeDetails?: Record<string, any>;
  notes?: string;
  createdAt: string;
}

// ── Expense Analytics ───────────────────────────────────────────────────────
export interface ExpenseAnalytics {
  totalExpenses: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  averageExpense: number;
  expensesByCategory: {
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }[];
  expensesByMonth: {
    month: string; // YYYY-MM
    amount: number;
  }[];
  expensesByPaymentMethod: {
    method: PaymentMethod;
    amount: number;
    count: number;
  }[];
  topVendors: {
    vendorName: string;
    amount: number;
    count: number;
  }[];
  recurringExpensesTotal: number;
  taxDeductibleTotal: number;
}

// ── Form Types ──────────────────────────────────────────────────────────────
export interface ExpenseFormData {
  categoryId: string;
  vendorName?: string;
  description: string;
  amount: number;
  currency: string;
  expenseDate: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  referenceNumber?: string;
  notes?: string;
  isRecurring: boolean;
  recurringFrequency?: RecurringFrequency;
  recurringEndDate?: string;
  taxAmount?: number;
  taxRate?: number;
  isTaxDeductible: boolean;
  approvalStatus?: ApprovalStatus;
  createdByRole?: UserRole;
}

// ── Expense Approval Form ───────────────────────────────────────────────────
export interface ExpenseApprovalFormData {
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  notes?: string;
}

// ── Generate Receipt Form ───────────────────────────────────────────────────
export interface GenerateReceiptFormData {
  expenseId: string;
  receiptDate?: string;
}

// ── Expense Note Form ───────────────────────────────────────────────────────
export interface ExpenseNoteFormData {
  expenseId: string;
  noteType: ExpenseNoteType;
  content: string;
}

export interface RecurringExpenseFormData {
  categoryId: string;
  vendorName?: string;
  description: string;
  amount: number;
  currency: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  paymentMethod?: PaymentMethod;
  autoGenerate: boolean;
  notes?: string;
}

export interface ExpenseCategoryFormData {
  name: string;
  description?: string;
  color: string;
  icon: string;
}

// ── Filter Types ────────────────────────────────────────────────────────────
export interface ExpenseFilters {
  categoryId?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  approvalStatus?: ApprovalStatus;
  createdByRole?: UserRole;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  isRecurring?: boolean;
  isTaxDeductible?: boolean;
  vendorName?: string;
  searchQuery?: string;
}

// ── Summary Types ───────────────────────────────────────────────────────────
export interface ExpenseSummary {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  byStatus: Record<PaymentStatus, { amount: number; count: number }>;
  byCategory: Record<string, { amount: number; count: number }>;
}
