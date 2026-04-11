export interface CustomerCreditAccount {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  status: 'active' | 'suspended' | 'blocked';
  createdAt: string;
  updatedAt: string;
  lastPaymentDate?: string;
  notes?: string;
}

export interface CreditTransaction {
  id: string;
  accountId: string;
  customerId: string;
  type: 'charge' | 'payment' | 'adjustment' | 'writeoff';
  amount: number;
  balanceAfter: number;
  orderId?: string;
  description: string;
  performedBy: string;
  performedByName: string;
  timestamp: string;
  metadata?: {
    orderId?: string;
    orderTotal?: number;
    paymentMethod?: string;
    reason?: string;
  };
}

export interface CreditApplication {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  requestedLimit: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  notes?: string;
  rejectionReason?: string;
}

export interface CreditPayment {
  id: string;
  accountId: string;
  customerId: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'mobile' | 'bank_transfer' | 'other';
  reference?: string;
  paidBy: string;
  paidByName: string;
  paidAt: string;
  notes?: string;
}

export type CreditAccountStatus = 'active' | 'suspended' | 'blocked';
export type CreditTransactionType = 'charge' | 'payment' | 'adjustment' | 'writeoff';
export type CreditApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type CreditPaymentMethod = 'cash' | 'card' | 'mobile' | 'bank_transfer' | 'other';

export interface CreditSummary {
  totalAccounts: number;
  activeAccounts: number;
  totalOutstanding: number;
  overdueAmount: number;
  averageCreditUtilization: number;
  accountsOverLimit: number;
}

export interface CreditAlert {
  id: string;
  accountId: string;
  customerName: string;
  customerPhone: string;
  type: 'over_limit' | 'overdue' | 'near_limit' | 'suspended';
  message: string;
  amount: number;
  createdAt: string;
  isResolved: boolean;
}