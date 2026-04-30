import React, { useState, useEffect } from 'react';
import { useCredit } from '../../hooks/useCredit';
import { useOrdersContext } from '../../contexts/OrdersContext';
import { fetchOrderById } from '../../api/orders';
import type { CustomerCreditAccount } from '../../types/credit';
import type { Order } from '../../types';
import { Staff } from '../../types';

type TabType = 'accounts' | 'applications' | 'transactions' | 'reports';

const normalizeOrderRef = (raw: any): string => {
  const value = String(raw || '').trim();
  if (!value) return 'UNKNOWN';
  return value.slice(0, 7).toUpperCase();
};

const getOrderNumberSafe = (order: any): string =>
  normalizeOrderRef(order?.orderNumber ?? order?.order_number ?? order?.id);

const getOrderCustomerName = (order: any): string =>
  String(order?.customerName ?? order?.customer_name ?? '').trim();

const getOrderCustomerPhone = (order: any): string =>
  String(order?.customerPhone ?? order?.customer_phone ?? '').trim();

const getOrderCreatedAt = (order: any): string =>
  String(order?.createdAt ?? order?.created_at ?? new Date().toISOString());

const normalizeOrderItems = (items: any[] = []) =>
  items.map((item, index) => ({
    id: item?.id ?? `item-${index}`,
    menuItemName: item?.menuItemName ?? item?.menu_item_name ?? item?.name ?? 'Item',
    quantity: item?.quantity ?? 0,
    totalPrice: item?.totalPrice ?? item?.total_price ?? 0,
  }));

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
  const { orders, getOrderById } = useOrdersContext();
  const [orderLookupId, setOrderLookupId] = useState('');
  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  const [orderLookupError, setOrderLookupError] = useState('');
  const [orderData, setOrderData] = useState<Order | null>(null);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Create account modal state (lifted to avoid component-inside-component re-mount issues)
  const [createModalFormData, setCreateModalFormData] = useState({
    customerName: '',
    idNumber: '',
    customerPhone: '',
    creditLimit: '',
    notes: '',
  });
  const [createModalSubmitError, setCreateModalSubmitError] = useState('');

  // Transaction modal state (lifted for the same reason)
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txReference, setTxReference] = useState('');

  // Transactions tab state
  const [selectedTxAccountId, setSelectedTxAccountId] = useState('');
  const [txTabLoading, setTxTabLoading] = useState(false);

  const {
    accounts,
    transactions,
    applications,
    summary,
    isLoading,
    loadError,
    loadCreditData,
    loadAccountTransactions,
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

  useEffect(() => {
    if (orderData) {
      const total = Number((orderData as any)?.total ?? 0);
      setCustomerNameInput(getOrderCustomerName(orderData));
      setCustomerPhoneInput(getOrderCustomerPhone(orderData));
      setCreditAmount(total > 0 ? total.toFixed(2) : '');
      setCreditLimit(total > 0 ? total.toFixed(2) : '');
    }
  }, [orderData]);

  // Populate create modal form when it opens
  useEffect(() => {
    if (!showCreateModal) {
      setCreateModalSubmitError('');
      return;
    }
    setCreateModalFormData({
      customerName: customerNameInput || (orderData as any)?.customerName || '',
      idNumber: customerIdNumber || '',
      customerPhone: customerPhoneInput || getOrderCustomerPhone(orderData) || '',
      creditLimit: creditLimit || creditAmount || (orderData?.total != null ? String(orderData.total) : ''),
      notes: quickNotes || (orderData ? `Account opened from order ${getOrderNumberSafe(orderData)}` : ''),
    });
  }, [showCreateModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset transaction modal when it closes
  useEffect(() => {
    if (!showTransactionModal) {
      setTxAmount('');
      setTxDescription('');
      setTxReference('');
    }
  }, [showTransactionModal]);

  // Filter accounts based on search
  const filteredAccounts = accounts.filter(account =>
    account.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (account.customerPhone || '').includes(searchTerm)
  );

  const filteredApplications = applications.filter(app =>
    app.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (app.customerPhone || '').includes(searchTerm)
  );

  const summaryView = (summary || {}) as any;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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

  const quickSelectedAccount = selectedAccountId
    ? accounts.find((account) => account.id === selectedAccountId) ?? null
    : null;

  const handleLookupOrder = async () => {
    const lookupId = orderLookupId.trim();
    setOrderLookupError('');
    setOrderData(null);

    if (!lookupId) {
      setOrderLookupError('Enter an order ID to search.');
      return;
    }

    setOrderLookupLoading(true);
    try {
      const existingOrder = getOrderById(lookupId) ?? orders.find(
        (order) => order.orderNumber === lookupId
      );

      if (existingOrder) {
        setOrderData(existingOrder);
      } else {
        const fetchedOrder = await fetchOrderById(lookupId);
        if (!fetchedOrder) {
          setOrderLookupError('Order not found. Please confirm the ID.');
        } else {
          const normalizedFetchedOrder = {
            ...(fetchedOrder as any),
            orderNumber: getOrderNumberSafe(fetchedOrder),
            customerName: getOrderCustomerName(fetchedOrder),
            customerPhone: getOrderCustomerPhone(fetchedOrder),
            createdAt: getOrderCreatedAt(fetchedOrder),
            items: normalizeOrderItems((fetchedOrder as any)?.items || []),
          };
          setOrderData(normalizedFetchedOrder as Order);
        }
      }
    } catch (err) {
      setOrderLookupError('Unable to retrieve order. Please try again.');
    } finally {
      setOrderLookupLoading(false);
    }
  };

  const clearQuickCreditForm = () => {
    setOrderLookupId('');
    setOrderData(null);
    setSelectedAccountId('');
    setCustomerNameInput('');
    setCustomerPhoneInput('');
    setCustomerIdNumber('');
    setCreditAmount('');
    setCreditLimit('');
    setQuickNotes('');
    setOrderLookupError('');
  };

  const handleRecordCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerNameInput.trim() || !customerPhoneInput.trim() || !creditAmount.trim()) {
      setOrderLookupError('Please complete the customer and amount fields before recording credit.');
      return;
    }

    const amount = parseFloat(creditAmount);
    const limit = parseFloat(creditLimit) || Math.max(amount, 1000);

    if (isNaN(amount) || amount <= 0) {
      setOrderLookupError('Please enter a valid credit amount.');
      return;
    }

    setOrderLookupError('');

    try {
      let account = quickSelectedAccount ?? accounts.find((acc) => acc.customerPhone === customerPhoneInput.trim());

      if (!account) {
        account = await createAccount({
          customerName: customerNameInput.trim(),
          customerPhone: customerPhoneInput.trim(),
          creditLimit: Math.max(limit, amount),
          notes: quickNotes || `Credit created for order ${orderData?.orderNumber ?? ''}`,
        });
      }

      await chargeCredit({
        accountId: account.id,
        customerId: account.customerId || orderData?.customerId || '',
        amount,
        orderId: orderData?.id,
        description: quickNotes || `Credit for order ${getOrderNumberSafe(orderData) || orderLookupId}`,
        performedBy: user?.id || '',
        performedByName: user?.name || '',
      });

      clearQuickCreditForm();
      loadCreditData();
      alert('Credit entry recorded successfully.');
    } catch (err) {
      console.error('Failed to record credit:', err);
      setOrderLookupError('Failed to record credit. Please try again.');
    }
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateModalSubmitError('');
    const parsedLimit = parseFloat(createModalFormData.creditLimit);
    if (!createModalFormData.customerName.trim()) {
      setCreateModalSubmitError('Customer name is required.');
      return;
    }
    if (!createModalFormData.idNumber.trim()) {
      setCreateModalSubmitError('ID / Passport number is required.');
      return;
    }
    if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
      setCreateModalSubmitError('Please enter a valid credit limit.');
      return;
    }
    try {
      const idNote = createModalFormData.idNumber.trim() ? `ID/Passport: ${createModalFormData.idNumber.trim()}` : '';
      const baseNote = createModalFormData.notes.trim();
      const combinedNotes = [idNote, baseNote].filter(Boolean).join(' | ') || undefined;
      await createAccount({
        customerName: createModalFormData.customerName.trim(),
        customerPhone: createModalFormData.customerPhone.trim(),
        creditLimit: parsedLimit,
        notes: combinedNotes,
      });
      setShowCreateModal(false);
      setCreateModalFormData({ customerName: '', idNumber: '', customerPhone: '', creditLimit: '', notes: '' });
      loadCreditData();
    } catch (err: any) {
      console.error('Failed to create account:', err);
      setCreateModalSubmitError(err?.message || 'Failed to create credit account. Check backend connectivity.');
    }
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    try {
      switch (transactionType) {
        case 'charge':
          await chargeCredit({
            accountId: selectedAccount.id,
            customerId: String(selectedAccount.customerId || ''),
            amount: parseFloat(txAmount),
            description: txDescription || 'Credit charge',
            performedBy: user?.id || '',
            performedByName: user?.name || '',
          });
          break;
        case 'payment':
          await makePayment({
            accountId: selectedAccount.id,
            customerId: String(selectedAccount.customerId || ''),
            amount: parseFloat(txAmount),
            paymentMethod: 'cash',
            reference: txReference,
            paidBy: user?.id || '',
            paidByName: user?.name || '',
          });
          break;
        case 'adjustment':
          await adjustCredit({
            accountId: selectedAccount.id,
            customerId: String(selectedAccount.customerId || ''),
            amount: parseFloat(txAmount),
            reason: txDescription,
            performedBy: user?.id || '',
            performedByName: user?.name || '',
          });
          break;
      }
      setShowTransactionModal(false);
      loadCreditData();
    } catch (err) {
      console.error('Transaction failed:', err);
      alert('Transaction failed. Please try again.');
    }
  };

  // Render Accounts Tab
  const renderAccountsTab = () => (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-700 bg-slate-800/95 shadow-lg p-6 text-slate-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Credit from Order</h2>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Enter the order ID to pull order details, then complete the customer information and record the credit.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 transition"
          >
            <span>Open New Account</span>
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="sr-only" htmlFor="orderLookupId">Order ID</label>
              <input
                id="orderLookupId"
                type="text"
                value={orderLookupId}
                onChange={(e) => setOrderLookupId(e.target.value)}
                placeholder="Order ID or number"
                className="w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <button
                type="button"
                onClick={handleLookupOrder}
                disabled={orderLookupLoading}
                className="inline-flex items-center justify-center rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {orderLookupLoading ? 'Looking up...' : 'Lookup Order'}
              </button>
            </div>

            {orderLookupError && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {orderLookupError}
              </div>
            )}

            {orderData && (
              <div className="rounded-3xl border border-slate-700 bg-slate-800 p-4 text-slate-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-wide text-amber-300">Order details</p>
                    <p className="text-lg font-semibold">{getOrderNumberSafe(orderData)}</p>
                  </div>
                  <div className="space-y-1 text-right text-sm text-slate-400">
                    <p>Placed: {formatDate(getOrderCreatedAt(orderData))}</p>
                    <p>Status: <span className="font-semibold text-white">{orderData.status}</span></p>
                    <p>Served by: <span className="font-semibold text-white">{orderData.assignedWaiterId || 'Unknown'}</span></p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-800 p-4 border border-slate-700">
                  <p className="text-sm text-slate-400">Items</p>
                  <ul className="mt-3 space-y-3">
                    {orderData.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between rounded-2xl bg-slate-800 p-3">
                        <div>
                          <p className="font-medium text-slate-100">{(item as any).menuItemName || (item as any).menu_item_name || 'Item'}</p>
                          <p className="text-sm text-slate-400">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-sm font-semibold text-amber-300">{formatCurrency((item as any).totalPrice ?? (item as any).total_price ?? 0)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-800 p-5 text-slate-100">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300">Customer name</label>
                <input
                  type="text"
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  placeholder="Customer full name"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300">Phone number</label>
                <input
                  type="tel"
                  value={customerPhoneInput}
                  onChange={(e) => setCustomerPhoneInput(e.target.value)}
                  placeholder="Enter phone number"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300">ID / Passport</label>
                <input
                  type="text"
                  value={customerIdNumber}
                  onChange={(e) => setCustomerIdNumber(e.target.value)}
                  placeholder="ID or passport number"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300">Existing credit account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="">— Create new account —</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.customerName} — {account.customerPhone}
                    </option>
                  ))}
                </select>
                {accounts.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">No existing accounts yet. Leave blank to create one automatically.</p>
                )}
              </div>

              {quickSelectedAccount && (
                <div className="rounded-2xl border border-slate-700 bg-slate-700 p-4 text-sm text-slate-300">
                  <p className="font-medium text-white">Selected account</p>
                  <p>{quickSelectedAccount.customerName}</p>
                  <p>Available: {formatCurrency(quickSelectedAccount.availableCredit)}</p>
                  <p>Current balance: {formatCurrency(quickSelectedAccount.currentBalance)}</p>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-300">Credit limit</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="Set a credit limit"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300">Amount to credit</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="Enter amount or use order total"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300">Notes / description</label>
                <textarea
                  rows={3}
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  placeholder="e.g. credit for delayed payment"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-700 px-4 py-3 text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <button
                type="button"
                onClick={handleRecordCredit}
                className="mt-3 w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition"
              >
                Record credit to account
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-2xl border border-slate-700 bg-slate-700 text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <svg
            className="w-5 h-5 absolute left-3 top-2.5 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="ml-4 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition"
        >
          New Account
        </button>
      </div>

      <div className="bg-slate-800 shadow overflow-hidden sm:rounded-3xl border border-slate-700">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Credit Limit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Current Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Available</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-slate-800 divide-y divide-slate-800">
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="hover:bg-slate-800">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-100">{account.customerName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{account.customerPhone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-100">{formatCurrency(account.creditLimit)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-100">{formatCurrency(account.currentBalance)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-300 font-medium">
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
                    className="text-amber-500 hover:text-amber-800"
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
          <div className="text-center py-12 text-slate-400">
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
            className="w-full pl-10 pr-4 py-2 rounded-2xl border border-slate-700 bg-slate-700 text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <svg
            className="w-5 h-5 absolute left-3 top-2.5 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="bg-slate-800 shadow overflow-hidden sm:rounded-3xl border border-slate-700">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Requested Limit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Requested Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-slate-800 divide-y divide-slate-800">
            {filteredApplications.map((application) => (
              <tr key={application.id} className="hover:bg-slate-800">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-100">{application.customerName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{application.customerPhone || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-100">{formatCurrency(application.requestedLimit)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatDate(application.requestedAt || application.createdAt || new Date().toISOString())}</td>
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
                    <span className="text-slate-400">Reviewed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredApplications.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            No credit applications found.
          </div>
        )}
      </div>
    </div>
  );

  // Render Transactions Tab
  const renderTransactionsTab = () => (
    <div className="space-y-6">
      <div className="bg-slate-800 shadow overflow-hidden sm:rounded-3xl border border-slate-700">
        <div className="px-6 py-4 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-lg font-medium text-white flex-1">Transaction History</h3>
          <select
            value={selectedTxAccountId}
            onChange={async (e) => {
              const id = e.target.value;
              setSelectedTxAccountId(id);
              if (id) {
                setTxTabLoading(true);
                await loadAccountTransactions(id);
                setTxTabLoading(false);
              }
            }}
            className="rounded-xl border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="">— Select an account —</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.customerName} ({account.customerPhone})
              </option>
            ))}
          </select>
        </div>

        {!selectedTxAccountId && (
          <div className="p-6 text-slate-400 text-sm">
            Select a credit account above to view its transaction history.
          </div>
        )}

        {selectedTxAccountId && txTabLoading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
          </div>
        )}

        {selectedTxAccountId && !txTabLoading && (
          <>
            {transactions.length === 0 ? (
              <div className="p-6 text-slate-400 text-sm">No transactions found for this account.</div>
            ) : (
              <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Performed By</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-800 divide-y divide-slate-700">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          tx.type === 'charge' ? 'bg-red-100 text-red-800'
                          : tx.type === 'payment' ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300 max-w-xs truncate">
                        {tx.notes || '—'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                        tx.type === 'payment' ? 'text-emerald-300' : 'text-amber-300'
                      }`}>
                        {tx.type === 'payment' ? '-' : '+'}{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        {tx.performedByName || tx.performedBy || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Render Reports Tab
  const renderReportsTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-slate-800 shadow rounded-2xl sm:rounded-3xl border border-slate-700">
          <div className="px-3 py-4 sm:px-4 sm:py-5">
            <dt className="text-xs sm:text-sm font-medium text-slate-400 truncate">Total Accounts</dt>
            <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-slate-100">{summary?.totalAccounts || 0}</dd>
          </div>
        </div>
        <div className="bg-slate-800 shadow rounded-2xl sm:rounded-3xl border border-slate-700">
          <div className="px-3 py-4 sm:px-4 sm:py-5">
            <dt className="text-xs sm:text-sm font-medium text-slate-400 truncate">Active Accounts</dt>
            <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-emerald-300">{summary?.activeAccounts || 0}</dd>
          </div>
        </div>
        <div className="bg-slate-800 shadow rounded-2xl sm:rounded-3xl border border-slate-700">
          <div className="px-3 py-4 sm:px-4 sm:py-5">
            <dt className="text-xs sm:text-sm font-medium text-slate-400 truncate">Total Outstanding</dt>
            <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-rose-300">{formatCurrency(summaryView.totalOutstanding || 0)}</dd>
          </div>
        </div>
        <div className="bg-slate-800 shadow rounded-2xl sm:rounded-3xl border border-slate-700">
          <div className="px-3 py-4 sm:px-4 sm:py-5">
            <dt className="text-xs sm:text-sm font-medium text-slate-400 truncate">Accounts Overdue</dt>
            <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-amber-300">{summaryView.accountsOverLimit || 0}</dd>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 shadow rounded-3xl border border-slate-700">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-medium text-white">Credit Summary</h3>
        </div>
        <div className="p-6 space-y-4 text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">Total Outstanding</span>
            <span className="font-medium text-slate-100">{formatCurrency(summaryView.totalOutstanding || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Average Credit Utilization</span>
            <span className="font-medium text-slate-100">{((summaryView.averageCreditUtilization || 0) * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Accounts Over Limit</span>
            <span className="font-medium text-rose-300">{summaryView.accountsOverLimit || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Overdue Amount</span>
            <span className="font-medium text-amber-300">{formatCurrency(summaryView.overdueAmount || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:py-6 sm:px-6 lg:px-8">
        <div className="px-0 py-4 sm:py-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white">Credit Management</h1>
          </div>

          {loadError && (
            <div className="mb-4 rounded-3xl border border-red-600/30 bg-red-500/10 px-4 py-3 text-red-200">
              {loadError}
            </div>
          )}

          {isLoading && !accounts.length && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Tabs */}
              <div className="border-b border-slate-700 mb-6 overflow-x-auto">
                <nav className="-mb-px flex space-x-4 sm:space-x-8 whitespace-nowrap">
                  <button
                    onClick={() => setActiveTab('accounts')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'accounts'
                        ? 'border-amber-400 text-amber-300'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    Accounts
                  </button>
                  <button
                    onClick={() => setActiveTab('applications')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'applications'
                        ? 'border-amber-400 text-amber-300'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
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
                        ? 'border-amber-400 text-amber-300'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Transactions
                  </button>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'reports'
                        ? 'border-amber-400 text-amber-300'
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

      {/* Create Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-90 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 sm:top-20 mx-auto p-4 sm:p-5 border border-slate-700 w-full sm:w-96 shadow-2xl rounded-2xl sm:rounded-3xl bg-slate-800 text-slate-100">
            <h3 className="text-lg font-medium text-white mb-4">Create New Credit Account</h3>
            {createModalSubmitError && (
              <div className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-red-200 mb-3">
                {createModalSubmitError}
              </div>
            )}
            <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Customer Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Full name"
                  value={createModalFormData.customerName}
                  onChange={(e) => setCreateModalFormData({ ...createModalFormData, customerName: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">ID / Passport Number <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="National ID or passport"
                  value={createModalFormData.idNumber}
                  onChange={(e) => setCreateModalFormData({ ...createModalFormData, idNumber: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div className="border-t border-slate-700 pt-3">
                <p className="text-xs text-slate-400 mb-3">Pre-filled from order lookup — edit if needed</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={createModalFormData.customerPhone}
                      onChange={(e) => setCreateModalFormData({ ...createModalFormData, customerPhone: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Credit Limit (RWF)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={createModalFormData.creditLimit}
                      onChange={(e) => setCreateModalFormData({ ...createModalFormData, creditLimit: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Notes (Optional)</label>
                    <textarea
                      value={createModalFormData.notes}
                      onChange={(e) => setCreateModalFormData({ ...createModalFormData, notes: e.target.value })}
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-700 bg-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 hover:bg-amber-500"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransactionModal && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-80 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 sm:top-20 mx-auto p-4 sm:p-5 border border-slate-700 w-full sm:w-96 shadow-2xl rounded-2xl sm:rounded-3xl bg-slate-800 text-slate-100">
            <h3 className="text-lg font-medium text-white mb-4">
              {transactionType === 'charge' && 'Add Charge'}
              {transactionType === 'payment' && 'Record Payment'}
              {transactionType === 'adjustment' && 'Manual Adjustment'}
            </h3>
            <div className="mb-4 p-3 bg-slate-800 rounded-2xl border border-slate-700">
              <p className="text-sm text-slate-300">Account: <strong className="text-white">{selectedAccount.customerName}</strong></p>
              <p className="text-sm text-slate-300">Current Balance: <strong className="text-white">{formatCurrency(selectedAccount.currentBalance)}</strong></p>
              <p className="text-sm text-slate-300">Available Credit: <strong className="text-white">{formatCurrency(selectedAccount.availableCredit)}</strong></p>
            </div>
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Amount (RWF)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              {transactionType !== 'payment' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300">Description</label>
                  <input
                    type="text"
                    required
                    value={txDescription}
                    onChange={(e) => setTxDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              )}
              {transactionType === 'payment' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300">Reference (Optional)</label>
                  <input
                    type="text"
                    value={txReference}
                    onChange={(e) => setTxReference(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-700 bg-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 hover:bg-amber-500"
                >
                  {transactionType === 'charge' && 'Add Charge'}
                  {transactionType === 'payment' && 'Record Payment'}
                  {transactionType === 'adjustment' && 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditManagement;
