import type {
  CustomerCreditAccount,
  CreditTransaction,
  CreditApplication,
  CreditPayment,
  CreditSummary,
  CreditAlert,
} from '../types/credit';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// ── Credit Accounts ────────────────────────────────────────────────────────

export async function getCreditAccounts(): Promise<CustomerCreditAccount[]> {
  const res = await fetch(`${API_BASE}/credit/accounts`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit accounts');
  return res.json();
}

export async function getCreditAccount(accountId: string): Promise<CustomerCreditAccount> {
  const res = await fetch(`${API_BASE}/credit/accounts/${accountId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit account');
  return res.json();
}

export async function getCreditAccountByPhone(phone: string): Promise<CustomerCreditAccount | null> {
  const res = await fetch(`${API_BASE}/credit/accounts?phone=${encodeURIComponent(phone)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit account');
  const accounts = await res.json();
  return accounts[0] || null;
}

export async function createCreditAccount(data: {
  customerName: string;
  customerPhone: string;
  creditLimit: number;
  notes?: string;
}): Promise<CustomerCreditAccount> {
  const res = await fetch(`${API_BASE}/credit/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create credit account');
  return res.json();
}

export async function updateCreditAccount(
  accountId: string,
  data: Partial<{
    creditLimit: number;
    status: 'active' | 'suspended' | 'blocked';
    notes: string;
  }>
): Promise<CustomerCreditAccount> {
  const res = await fetch(`${API_BASE}/credit/accounts/${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update credit account');
  return res.json();
}

export async function deleteCreditAccount(accountId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/credit/accounts/${accountId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete credit account');
}

// ── Credit Transactions ────────────────────────────────────────────────────

export async function getCreditTransactions(accountId: string): Promise<CreditTransaction[]> {
  const res = await fetch(`${API_BASE}/credit/accounts/${accountId}/transactions`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit transactions');
  return res.json();
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
  const res = await fetch(`${API_BASE}/credit/transactions/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add credit charge');
  return res.json();
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
  const res = await fetch(`${API_BASE}/credit/transactions/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add credit payment');
  return res.json();
}

export async function addCreditAdjustment(data: {
  accountId: string;
  customerId: string;
  amount: number;
  reason: string;
  performedBy: string;
  performedByName: string;
}): Promise<{ transaction: CreditTransaction; account: CustomerCreditAccount }> {
  const res = await fetch(`${API_BASE}/credit/transactions/adjustment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add credit adjustment');
  return res.json();
}

// ── Credit Applications ────────────────────────────────────────────────────

export async function getCreditApplications(status?: string): Promise<CreditApplication[]> {
  const url = status
    ? `${API_BASE}/credit/applications?status=${status}`
    : `${API_BASE}/credit/applications`;
  const res = await fetch(url, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit applications');
  return res.json();
}

export async function submitCreditApplication(data: {
  customerName: string;
  customerPhone: string;
  requestedLimit: number;
  notes?: string;
  requestedBy: string;
  requestedByName: string;
}): Promise<CreditApplication> {
  const res = await fetch(`${API_BASE}/credit/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to submit credit application');
  return res.json();
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
  const res = await fetch(`${API_BASE}/credit/applications/${applicationId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to review credit application');
  return res.json();
}

// ── Credit Summary & Alerts ────────────────────────────────────────────────

export async function getCreditSummary(): Promise<CreditSummary> {
  const res = await fetch(`${API_BASE}/credit/summary`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit summary');
  return res.json();
}

export async function getCreditAlerts(): Promise<CreditAlert[]> {
  const res = await fetch(`${API_BASE}/credit/alerts`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch credit alerts');
  return res.json();
}

export async function resolveCreditAlert(alertId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/credit/alerts/${alertId}/resolve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to resolve credit alert');
}