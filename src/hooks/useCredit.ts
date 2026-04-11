import { useState, useEffect, useCallback } from 'react';
import type {
  CustomerCreditAccount,
  CreditTransaction,
  CreditApplication,
  CreditSummary,
  CreditAlert,
} from '../types/credit';
import {
  getCreditAccounts,
  getCreditAccount,
  getCreditAccountByPhone,
  createCreditAccount,
  updateCreditAccount,
  deleteCreditAccount,
  getCreditTransactions,
  addCreditCharge,
  addCreditPayment,
  addCreditAdjustment,
  getCreditApplications,
  submitCreditApplication,
  reviewCreditApplication,
  getCreditSummary,
  getCreditAlerts,
  resolveCreditAlert,
} from '../api/credit';

export function useCredit() {
  // State
  const [accounts, setAccounts] = useState<CustomerCreditAccount[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [alerts, setAlerts] = useState<CreditAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load all credit data
  const loadCreditData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [accountsData, applicationsData, summaryData, alertsData] = await Promise.all([
        getCreditAccounts(),
        getCreditApplications(),
        getCreditSummary(),
        getCreditAlerts(),
      ]);
      setAccounts(accountsData);
      setApplications(applicationsData);
      setSummary(summaryData);
      setAlerts(alertsData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load credit data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load transactions for a specific account
  const loadAccountTransactions = useCallback(async (accountId: string) => {
    try {
      const transactionsData = await getCreditTransactions(accountId);
      setTransactions(transactionsData);
      return transactionsData;
    } catch (err) {
      console.error('Failed to load transactions:', err);
      return [];
    }
  }, []);

  // Get account by phone
  const getAccountByPhone = useCallback(async (phone: string): Promise<CustomerCreditAccount | null> => {
    try {
      return await getCreditAccountByPhone(phone);
    } catch (err) {
      console.error('Failed to get account by phone:', err);
      return null;
    }
  }, []);

  // Create new credit account
  const createAccount = useCallback(async (data: {
    customerName: string;
    customerPhone: string;
    creditLimit: number;
    notes?: string;
  }) => {
    try {
      const account = await createCreditAccount(data);
      setAccounts(prev => [...prev, account]);
      return account;
    } catch (err) {
      console.error('Failed to create account:', err);
      throw err;
    }
  }, []);

  // Update credit account
  const updateAccount = useCallback(async (
    accountId: string,
    data: Partial<{
      creditLimit: number;
      status: 'active' | 'suspended' | 'blocked';
      notes: string;
    }>
  ) => {
    try {
      const account = await updateCreditAccount(accountId, data);
      setAccounts(prev => prev.map(acc => acc.id === accountId ? account : acc));
      return account;
    } catch (err) {
      console.error('Failed to update account:', err);
      throw err;
    }
  }, []);

  // Delete credit account
  const deleteAccount = useCallback(async (accountId: string) => {
    try {
      await deleteCreditAccount(accountId);
      setAccounts(prev => prev.filter(acc => acc.id !== accountId));
    } catch (err) {
      console.error('Failed to delete account:', err);
      throw err;
    }
  }, []);

  // Add credit charge (for credit orders)
  const chargeCredit = useCallback(async (data: {
    accountId: string;
    customerId: string;
    amount: number;
    orderId?: string;
    description: string;
    performedBy: string;
    performedByName: string;
  }) => {
    try {
      const result = await addCreditCharge(data);
      // Update account in list
      setAccounts(prev => prev.map(acc => acc.id === result.account.id ? result.account : acc));
      // Add transaction to list
      setTransactions(prev => [...prev, result.transaction]);
      return result;
    } catch (err) {
      console.error('Failed to charge credit:', err);
      throw err;
    }
  }, []);

  // Add credit payment
  const makePayment = useCallback(async (data: {
    accountId: string;
    customerId: string;
    amount: number;
    paymentMethod: 'cash' | 'card' | 'mobile' | 'bank_transfer' | 'other';
    reference?: string;
    paidBy: string;
    paidByName: string;
    notes?: string;
  }) => {
    try {
      const result = await addCreditPayment(data);
      // Update account in list
      setAccounts(prev => prev.map(acc => acc.id === result.account.id ? result.account : acc));
      // Add transaction to list
      setTransactions(prev => [...prev, result.transaction]);
      return result;
    } catch (err) {
      console.error('Failed to make payment:', err);
      throw err;
    }
  }, []);

  // Add credit adjustment
  const adjustCredit = useCallback(async (data: {
    accountId: string;
    customerId: string;
    amount: number;
    reason: string;
    performedBy: string;
    performedByName: string;
  }) => {
    try {
      const result = await addCreditAdjustment(data);
      // Update account in list
      setAccounts(prev => prev.map(acc => acc.id === result.account.id ? result.account : acc));
      // Add transaction to list
      setTransactions(prev => [...prev, result.transaction]);
      return result;
    } catch (err) {
      console.error('Failed to adjust credit:', err);
      throw err;
    }
  }, []);

  // Submit credit application
  const submitApplication = useCallback(async (data: {
    customerName: string;
    customerPhone: string;
    requestedLimit: number;
    notes?: string;
    requestedBy: string;
    requestedByName: string;
  }) => {
    try {
      const application = await submitCreditApplication(data);
      setApplications(prev => [...prev, application]);
      return application;
    } catch (err) {
      console.error('Failed to submit application:', err);
      throw err;
    }
  }, []);

  // Review credit application
  const reviewApplication = useCallback(async (
    applicationId: string,
    data: {
      status: 'approved' | 'rejected';
      creditLimit?: number;
      notes?: string;
      rejectionReason?: string;
      reviewedBy: string;
      reviewedByName: string;
    }
  ) => {
    try {
      const application = await reviewCreditApplication(applicationId, data);
      setApplications(prev => prev.map(app => app.id === applicationId ? application : app));
      
      // If approved, create the credit account
      if (data.status === 'approved' && data.creditLimit) {
        const originalApp = applications.find(app => app.id === applicationId);
        if (originalApp) {
          await createCreditAccount({
            customerName: originalApp.customerName,
            customerPhone: originalApp.customerPhone,
            creditLimit: data.creditLimit,
            notes: data.notes,
          });
        }
      }
      
      return application;
    } catch (err) {
      console.error('Failed to review application:', err);
      throw err;
    }
  }, [applications, createCreditAccount]);

  // Resolve credit alert
  const dismissAlert = useCallback(async (alertId: string) => {
    try {
      await resolveCreditAlert(alertId);
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, isResolved: true } : alert
      ));
    } catch (err) {
      console.error('Failed to resolve alert:', err);
      throw err;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadCreditData();
  }, [loadCreditData]);

  return {
    // Data
    accounts,
    transactions,
    applications,
    summary,
    alerts,
    isLoading,
    loadError,
    
    // Actions
    loadCreditData,
    loadAccountTransactions,
    getAccountByPhone,
    createAccount,
    updateAccount,
    deleteAccount,
    chargeCredit,
    makePayment,
    adjustCredit,
    submitApplication,
    reviewApplication,
    dismissAlert,
  };
}