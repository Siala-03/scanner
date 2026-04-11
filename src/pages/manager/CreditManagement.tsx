import React, { useState, useEffect } from 'react';
import { useCredit } from '../../hooks/useCredit';
import type { CustomerCreditAccount } from '../../types/credit';
import { Staff } from '../../types';

type TabType = 'accounts' | 'applications' | 'transactions' | 'reports';

const CreditManagement: React.FC = () => {
  // Get user from localStorage (same pattern as other manager pages)
  const [user, setUser] = useState<Staff | null>(null);
  
  useEffect(() => {
    const savedUser = localStorage.getItem('authUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Failed to parse user from localStorage:', e);
      }
    }
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('accounts');
  const [selectedAccount, setSelectedAccount] = useState<CustomerCreditAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'charge' | 'payment' | 'adjustment'>('charge');

  const {
    accounts,
    applications,
    summary,
    isLoading,
    loadError,
    loadCreditData,
    createAccount,
    chargeCredit,
    makePayment,
    adjustCredit,
    reviewApplication,
  } = useCredit();

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'superadmin')) {
      loadCreditData();
    }
  }, [user, loadCreditData]);

  // Filter accounts based on search
  const filteredAccounts = accounts.filter(account =>
    account.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.customerPhone.includes(searchTerm)
  );

  const filteredApplications = applications.filter(app =>
    app.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.customerPhone.includes(searchTerm)
  );

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'suspended':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Render Accounts Tab
  const renderAccountsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="w-5 h-5 absolute left-3 top-2.5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Account
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Limit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{account.customerName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{account.customerPhone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(account.creditLimit)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(account.currentBalance)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                  {formatCurrency(account.availableCredit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(account.status)}`}>
                    {account.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => {
                      setSelectedAccount(account);
                      setShowTransactionModal(true);
                      setTransactionType('charge');
                    }}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Charge
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAccount(account);
                      setShowTransactionModal(true);
                      setTransactionType('payment');
                    }}
                    className="text-green-600 hover:text-green-900"
                  >
                    Payment
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAccount(account);
                      setShowTransactionModal(true);
                      setTransactionType('adjustment');
                    }}
                    className="text-yellow-600 hover:text-yellow-900"
                  >
                    Adjust
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAccounts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No credit accounts found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );

  // Render Applications Tab
  const renderApplicationsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="w-5 h-5 absolute left-3 top-2.5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested Limit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredApplications.map((application) => (
              <tr key={application.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{application.customerName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{application.customerPhone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(application.requestedLimit)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(application.requestedAt)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(application.status)}`}>
                    {application.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  {application.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          const creditLimitValue = prompt('Enter approved credit limit:', application.requestedLimit.toString());
                          const approvedLimit = creditLimitValue ? parseFloat(creditLimitValue) : NaN;
                          if (isNaN(approvedLimit) || approvedLimit <= 0) {
                            alert('Please enter a valid approved credit limit.');
                            return;
                          }
                          reviewApplication(application.id, {
                            status: 'approved',
                            creditLimit: approvedLimit,
                            reviewedBy: user?.id || '',
                            reviewedByName: user?.name || '',
                          });
                        }}
                        className="text-green-600 hover:text-green-900"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('Enter rejection reason:');
                          if (reason) {
                            reviewApplication(application.id, {
                              status: 'rejected',
                              rejectionReason: reason,
                              reviewedBy: user?.id || '',
                              reviewedByName: user?.name || '',
                            });
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {application.status !== 'pending' && (
                    <span className="text-gray-500">Reviewed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredApplications.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No credit applications found.
          </div>
        )}
      </div>
    </div>
  );

  // Render Transactions Tab
  const renderTransactionsTab = () => (
    <div className="space-y-6">
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-500">Transaction history will be displayed here. Select an account from the Accounts tab to view its transactions.</p>
        </div>
      </div>
    </div>
  );

  // Render Reports Tab
  const renderReportsTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Accounts</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{summary?.totalAccounts || 0}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Active Accounts</dt>
            <dd className="mt-1 text-3xl font-semibold text-green-600">{summary?.activeAccounts || 0}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Outstanding</dt>
            <dd className="mt-1 text-3xl font-semibold text-red-600">{formatCurrency(summary?.totalOutstanding || 0)}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Accounts Overdue</dt>
            <dd className="mt-1 text-3xl font-semibold text-yellow-600">{summary?.accountsOverLimit || 0}</dd>
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Credit Summary</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Outstanding</span>
            <span className="font-medium">{formatCurrency(summary?.totalOutstanding || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Average Credit Utilization</span>
            <span className="font-medium">{((summary?.averageCreditUtilization || 0) * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Accounts Over Limit</span>
            <span className="font-medium text-red-600">{summary?.accountsOverLimit || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Overdue Amount</span>
            <span className="font-medium text-yellow-600">{formatCurrency(summary?.overdueAmount || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Create Account Modal
  const CreateAccountModal = () => {
    const [formData, setFormData] = useState({
      customerName: '',
      customerPhone: '',
      creditLimit: '',
      notes: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await createAccount({
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          creditLimit: parseFloat(formData.creditLimit),
          notes: formData.notes,
        });
        setShowCreateModal(false);
        setFormData({ customerName: '', customerPhone: '', creditLimit: '', notes: '' });
        loadCreditData();
      } catch (err) {
        console.error('Failed to create account:', err);
      }
    };

    if (!showCreateModal) return null;

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Credit Account</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Customer Name</label>
              <input
                type="text"
                required
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input
                type="tel"
                required
                value={formData.customerPhone}
                onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Credit Limit (R)</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.creditLimit}
                onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700"
              >
                Create Account
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Transaction Modal
  const TransactionModal = () => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [reference, setReference] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedAccount) return;

      try {
        switch (transactionType) {
          case 'charge':
            await chargeCredit({
              accountId: selectedAccount.id,
              customerId: selectedAccount.customerId,
              amount: parseFloat(amount),
              description: description || 'Credit charge',
              performedBy: user?.id || '',
              performedByName: user?.name || '',
            });
            break;
          case 'payment':
            await makePayment({
              accountId: selectedAccount.id,
              customerId: selectedAccount.customerId,
              amount: parseFloat(amount),
              paymentMethod: 'cash',
              reference: reference,
              paidBy: user?.id || '',
              paidByName: user?.name || '',
            });
            break;
          case 'adjustment':
            await adjustCredit({
              accountId: selectedAccount.id,
              customerId: selectedAccount.customerId,
              amount: parseFloat(amount),
              reason: description,
              performedBy: user?.id || '',
              performedByName: user?.name || '',
            });
            break;
        }
        setShowTransactionModal(false);
        setAmount('');
        setDescription('');
        setReference('');
        loadCreditData();
      } catch (err) {
        console.error('Transaction failed:', err);
        alert('Transaction failed. Please try again.');
      }
    };

    if (!showTransactionModal || !selectedAccount) return null;

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {transactionType === 'charge' && 'Add Charge'}
            {transactionType === 'payment' && 'Record Payment'}
            {transactionType === 'adjustment' && 'Manual Adjustment'}
          </h3>
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">Account: <strong>{selectedAccount.customerName}</strong></p>
            <p className="text-sm text-gray-600">Current Balance: <strong>{formatCurrency(selectedAccount.currentBalance)}</strong></p>
            <p className="text-sm text-gray-600">Available Credit: <strong>{formatCurrency(selectedAccount.availableCredit)}</strong></p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount (R)</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {transactionType !== 'payment' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
            {transactionType === 'payment' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Reference (Optional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowTransactionModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700"
              >
                {transactionType === 'charge' && 'Add Charge'}
                {transactionType === 'payment' && 'Record Payment'}
                {transactionType === 'adjustment' && 'Apply Adjustment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Credit Management</h1>

          {loadError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {loadError}
            </div>
          )}

          {isLoading && !accounts.length && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('accounts')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'accounts'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Accounts
                  </button>
                  <button
                    onClick={() => setActiveTab('applications')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'applications'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Applications
                    {applications.filter(a => a.status === 'pending').length > 0 && (
                      <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                        {applications.filter(a => a.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('transactions')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'transactions'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Transactions
                  </button>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'reports'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Reports
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              {activeTab === 'accounts' && renderAccountsTab()}
              {activeTab === 'applications' && renderApplicationsTab()}
              {activeTab === 'transactions' && renderTransactionsTab()}
              {activeTab === 'reports' && renderReportsTab()}
            </>
          )}
        </div>
      </div>

      <CreateAccountModal />
      <TransactionModal />
    </div>
  );
};

export default CreditManagement;