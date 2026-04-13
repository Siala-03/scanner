export interface CustomerCreditAccount {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  status: 'active' | 'suspended' | 'closed';
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface CreditTransaction {
  id: string;
  accountId: string;
  orderId?: string;
  customerId?: string;
  type: 'charge' | 'payment' | 'adjustment';
  amount: number;
  balanceAfter?: number;
  notes?: string;
  performedBy: string;
  performedByName: string;
  createdAt: string;
}

export interface CreditApplication {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  requestedLimit: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedLimit?: number;
  notes?: string;
  rejectionReason?: string;
  requestedAt?: string;
  createdAt?: string;
  restaurantId?: string;
}

export interface CreditPayment {
  id: string;
  accountId?: string;
  transactionId: string;
  customerId?: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'mobile' | 'bank_transfer' | 'other';
  reference?: string;
  paidBy?: string;
  paidByName?: string;
  createdAt: string;
  notes?: string;
}

export interface CreditSummary {
  totalAccounts: number;
  totalBalance: number;
  totalCreditLimit: number;
  activeAccounts: number;
}

export interface CreditAlert {
  id: string;
  accountId: string;
  customerName: string;
  phone?: string;
  type: 'limit_reached' | 'near_limit' | 'overdue' | 'suspended';
  message: string;
  createdAt: string;
}