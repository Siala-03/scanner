import { apiRequest } from './http';
import type {
  CustomerCreditAccount,
  CreditTransaction,
  CreditApplication,
  CreditPayment,
  CreditSummary,
  CreditAlert,
} from '../types/credit';

const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '';

// ── Credit Accounts ────────────────────────────────────────────────────────

export async function getCreditAccounts(): Promise<CustomerCreditAccount[]> {
  return apiRequest<CustomerCreditAccount[]>(`${API_BASE}/api/credit/accounts`);
}

export async function getCreditAccount(accountId: string): Promise<CustomerCreditAccount> {
  return apiRequest<CustomerCreditAccount>(`${API_BASE}/api/credit/accounts/${accountId}`);
}

export async function getCreditAccountByPhone(phone: string): Promise<CustomerCreditAccount | null> {
  const accounts = await apiRequest<CustomerCreditAccount[]>(`${API_BASE}/api/credit/accounts?phone=${encodeURIComponent(phone)}`);
  return accounts[0] || null;
}

export async function createCreditAccount(data: {
  customerName: string;
  customerPhone: string;
  creditLimit: number;
  notes?: string;
}): Promise<CustomerCreditAccount> {
  return apiRequest<CustomerCreditAccount>(`${API_BASE}/api/credit/accounts`, {
    method: 'POST',
    json: data,
  });
}

export async function updateCreditAccount(
  accountId: string,
  data: Partial<{
    creditLimit: number;
    status: 'active' | 'suspended' | 'blocked';
    notes: string;
  }>
): Promise<CustomerCreditAccount> {
  return apiRequest<CustomerCreditAccount>(`${API_BASE}/api/credit/accounts/${accountId}`, {
    method: 'PATCH',
    json: data,
  });
}

export async function deleteCreditAccount(accountId: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/api/credit/accounts/${accountId}`, {
    method: 'DELETE',
  });
}

// ── Credit Transactions ────────────────────────────────────────────────────

export async function getCreditTransactions(accountId: string): Promise<CreditTransaction[]> {
  return apiRequest<CreditTransaction[]>(`${API_BASE}/api/credit/accounts/${accountId}/transactions`);
}

export async function addCreditCharge(data: {
  accountId: string;
  customerId: string;
  amount: number;
  orderId?: string;
  description: string;
  performedBy: string;
  performedByName: string;
}): Promise<{ transaction: CreditTransaction; account: CustomerCreditAccount }> {
  return apiRequest<{ transaction: CreditTransaction; account: CustomerCreditAccount }>(`${API_BASE}/api/credit/transactions/charge`, {
    method: 'POST',
    json: data,
  });
}

export async function addCreditPayment(data: {
  accountId: string;
  customerId: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'mobile' | 'bank_transfer' | 'other';
  reference?: string;
  paidBy: string;
  paidByName: string;
  notes?: string;
}): Promise<{ transaction: CreditTransaction; payment: CreditPayment; account: CustomerCreditAccount }> {
  return apiRequest<{ transaction: CreditTransaction; payment: CreditPayment; account: CustomerCreditAccount }>(`${API_BASE}/api/credit/transactions/payment`, {
    method: 'POST',
    json: data,
  });
}

export async function addCreditAdjustment(data: {
  accountId: string;
  customerId: string;
  amount: number;
  reason: string;
  performedBy: string;
  performedByName: string;
}): Promise<{ transaction: CreditTransaction; account: CustomerCreditAccount }> {
  return apiRequest<{ transaction: CreditTransaction; account: CustomerCreditAccount }>(`${API_BASE}/api/credit/transactions/adjustment`, {
    method: 'POST',
    json: data,
  });
}

// ── Credit Applications ────────────────────────────────────────────────────

export async function getCreditApplications(status?: string): Promise<CreditApplication[]> {
  const url = status
    ? `${API_BASE}/api/credit/applications?status=${status}`
    : `${API_BASE}/api/credit/applications`;
  return apiRequest<CreditApplication[]>(url);
}

export async function submitCreditApplication(data: {
  customerName: string;
  customerPhone: string;
  requestedLimit: number;
  notes?: string;
  requestedBy: string;
  requestedByName: string;
}): Promise<CreditApplication> {
  return apiRequest<CreditApplication>(`${API_BASE}/api/credit/applications`, {
    method: 'POST',
    json: data,
  });
}

export async function reviewCreditApplication(
  applicationId: string,
  data: {
    status: 'approved' | 'rejected';
    creditLimit?: number;
    notes?: string;
    rejectionReason?: string;
    reviewedBy: string;
    reviewedByName: string;
  }
): Promise<CreditApplication> {
  return apiRequest<CreditApplication>(`${API_BASE}/api/credit/applications/${applicationId}/review`, {
    method: 'POST',
    json: data,
  });
}

// ── Credit Summary & Alerts ────────────────────────────────────────────────

export async function getCreditSummary(): Promise<CreditSummary> {
  return apiRequest<CreditSummary>(`${API_BASE}/api/credit/summary`);
}

export async function getCreditAlerts(): Promise<CreditAlert[]> {
  return apiRequest<CreditAlert[]>(`${API_BASE}/api/credit/alerts`);
}

export async function resolveCreditAlert(alertId: string): Promise<void> {
  await apiRequest<void>(`${API_BASE}/api/credit/alerts/${alertId}/resolve`, {
    method: 'POST',
  });
}