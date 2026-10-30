import React, { useState, useEffect } from 'react';
import { useCredit } from '../../hooks/useCredit';
import { fetchUnpaidOrders, confirmPayment } from '../../api/orders';
import type { CustomerCreditAccount } from '../../types/credit';
import { Staff } from '../../types';

// One page: stats, the accounts list, and a detail view per account.
// Orders can be charged to credit here ("Charge an Order", picked from the
// unpaid list) or at checkout (Payments → "Credit"); both mark the order paid
// as Credit so it leaves the payments queue.

// Unpaid orders come straight from the DB, so accept both field spellings.
const orderNo = (o: any) => String(o.order_number ?? o.orderNumber ?? String(o.id).slice(-6).toUpperCase());
const orderTable = (o: any) => o.table_number ?? o.tableNumber;
const orderTotal = (o: any) => Number(o.total ?? o.total_amount ?? 0) || 0;
const orderItems = (o: any): any[] => {
  if (Array.isArray(o.items)) return o.items;
  try { const p = JSON.parse(o.items); return Array.isArray(p) ? p : []; } catch { return []; }
};
const orderLabel = (o: any) => {
  const t = orderTable(o);
  return `#${orderNo(o)} · ${t == null || t === 999 ? (t === 999 ? 'Online' : 'Bar / Walk-up') : `Table ${t}`}`;
};

type TxType = 'charge' | 'payment' | 'adjustment';
type PayMethod = 'cash' | 'mobile' | 'card' | 'bank_transfer';

const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile', label: 'MoMo' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });

const statusClass = (status: string) =>
  status === 'active'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : status === 'suspended'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-slate-600/30 text-slate-300 border-slate-500/30';

const txClass = (type: string) =>
  type === 'charge'
    ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : type === 'payment'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

const CreditManagement: React.FC = () => {
  const [user, setUser] = useState<Staff | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('authUser');
      if (saved) setUser(JSON.parse(saved));
    } catch {
      /* not signed in */
    }
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [detailAccount, setDetailAccount] = useState<CustomerCreditAccount | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  // Create account modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ customerName: '', idNumber: '', customerPhone: '', creditLimit: '' });
  const [createError, setCreateError] = useState('');

  // Transaction modal
  const [txAccount, setTxAccount] = useState<CustomerCreditAccount | null>(null);
  const [txType, setTxType] = useState<TxType>('payment');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txReference, setTxReference] = useState('');
  const [txMethod, setTxMethod] = useState<PayMethod>('cash');
  const [txError, setTxError] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  // Charge-an-order modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [pickedOrder, setPickedOrder] = useState<any | null>(null);
  const [chargeAccountId, setChargeAccountId] = useState('');
  const [newAcc, setNewAcc] = useState({ name: '', phone: '', idNumber: '', limit: '' });
  const [orderChargeError, setOrderChargeError] = useState('');
  const [orderChargeSaving, setOrderChargeSaving] = useState(false);

  const {
    accounts,
    transactions,
    summary,
    isLoading,
    loadError,
    loadCreditData,
    loadAccountTransactions,
    createAccount,
    chargeCredit,
    makePayment,
    adjustCredit,
  } = useCredit();

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'superadmin')) {
      loadCreditData();
    }
  }, [user, loadCreditData]);

  // Keep the open detail view in sync with refreshed balances.
  useEffect(() => {
    if (!detailAccount) return;
    const fresh = accounts.find((a) => a.id === detailAccount.id);
    if (fresh && fresh !== detailAccount) setDetailAccount(fresh);
  }, [accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = searchTerm.trim().toLowerCase();
  const filteredAccounts = accounts.filter(
    (a) => !q || a.customerName.toLowerCase().includes(q) || (a.customerPhone || '').includes(q),
  );

  const summaryView = (summary || {}) as any;
  const stats = [
    { label: 'Outstanding', value: formatCurrency(summaryView.totalOutstanding || 0), color: 'text-rose-300' },
    { label: 'Active accounts', value: String(summaryView.activeAccounts ?? 0), color: 'text-emerald-300' },
    { label: 'Over limit', value: String(summaryView.accountsOverLimit ?? 0), color: 'text-amber-300' },
    { label: 'Overdue', value: formatCurrency(summaryView.overdueAmount || 0), color: 'text-amber-300' },
  ];

  const openDetail = async (account: CustomerCreditAccount) => {
    setDetailAccount(account);
    setTxLoading(true);
    try {
      await loadAccountTransactions(account.id);
    } finally {
      setTxLoading(false);
    }
  };

  const openTransaction = (account: CustomerCreditAccount, type: TxType) => {
    setTxAccount(account);
    setTxType(type);
    setTxAmount(type === 'payment' && account.currentBalance > 0 ? String(account.currentBalance) : '');
    setTxDescription('');
    setTxReference('');
    setTxMethod('cash');
    setTxError('');
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    const limit = parseFloat(createForm.creditLimit);
    if (!createForm.customerName.trim()) return setCreateError('Customer name is required.');
    if (!createForm.idNumber.trim()) return setCreateError('ID / Passport number is required.');
    if (Number.isNaN(limit) || limit < 0) return setCreateError('Enter a valid credit limit.');
    try {
      await createAccount({
        customerName: createForm.customerName.trim(),
        customerPhone: createForm.customerPhone.trim(),
        creditLimit: limit,
        notes: `ID/Passport: ${createForm.idNumber.trim()}`,
      });
      setShowCreateModal(false);
      setCreateForm({ customerName: '', idNumber: '', customerPhone: '', creditLimit: '' });
      loadCreditData();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create credit account.');
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAccount) return;
    const amount = parseFloat(txAmount);
    if (Number.isNaN(amount) || amount <= 0) return setTxError('Enter a valid amount.');
    if (txType !== 'payment' && !txDescription.trim()) return setTxError('Add a short description.');
    setTxError('');
    setTxSaving(true);
    const base = { accountId: txAccount.id, customerId: String(txAccount.customerId || ''), amount };
    try {
      if (txType === 'charge') {
        await chargeCredit({ ...base, description: txDescription.trim(), performedBy: user?.id || '', performedByName: user?.name || '' });
      } else if (txType === 'payment') {
        await makePayment({ ...base, paymentMethod: txMethod, reference: txReference.trim(), paidBy: user?.id || '', paidByName: user?.name || '' });
      } else {
        await adjustCredit({ ...base, reason: txDescription.trim(), performedBy: user?.id || '', performedByName: user?.name || '' });
      }
      const accountId = txAccount.id;
      setTxAccount(null);
      await loadCreditData();
      if (detailAccount?.id === accountId) await loadAccountTransactions(accountId);
    } catch (err: any) {
      setTxError(err?.message || 'Transaction failed. Please try again.');
    } finally {
      setTxSaving(false);
    }
  };

  const openOrderModal = async (accountId = '') => {
    setShowOrderModal(true);
    setPickedOrder(null);
    setOrderSearch('');
    setChargeAccountId(accountId);
    setNewAcc({ name: '', phone: '', idNumber: '', limit: '' });
    setOrderChargeError('');
    setOrdersLoading(true);
    try {
      setUnpaidOrders(await fetchUnpaidOrders());
    } catch {
      setOrderChargeError('Could not load unpaid orders.');
    } finally {
      setOrdersLoading(false);
    }
  };

  const oq = orderSearch.trim().toLowerCase();
  const visibleOrders = unpaidOrders.filter((o) => {
    if (!oq) return true;
    const t = orderTable(o);
    return orderNo(o).toLowerCase().includes(oq) || (t != null && String(t) === oq) ||
      String(o.customer_name ?? o.customerName ?? '').toLowerCase().includes(oq);
  });

  const chargeAccount = accounts.find((a) => a.id === chargeAccountId);
  const pickedTotal = pickedOrder ? orderTotal(pickedOrder) : 0;
  const orderChargeProblem = !pickedOrder
    ? 'Pick an order'
    : !chargeAccountId
      ? 'Choose an account'
      : chargeAccountId === 'new'
        ? (!newAcc.name.trim() || !newAcc.phone.trim() || !newAcc.idNumber.trim())
          ? 'Enter name, phone and ID for the new account'
          : (parseFloat(newAcc.limit) || 0) < pickedTotal ? 'Credit limit must cover the order total' : null
        : !chargeAccount
          ? 'Choose an account'
          : pickedTotal > chargeAccount.availableCredit
            ? `Over limit — only ${formatCurrency(chargeAccount.availableCredit)} available`
            : null;

  const handleChargeOrder = async () => {
    if (orderChargeProblem || !pickedOrder) return;
    setOrderChargeSaving(true);
    setOrderChargeError('');
    try {
      let account = chargeAccount;
      if (chargeAccountId === 'new') {
        account = await createAccount({
          customerName: newAcc.name.trim(),
          customerPhone: newAcc.phone.trim(),
          creditLimit: parseFloat(newAcc.limit) || pickedTotal,
          notes: `ID/Passport: ${newAcc.idNumber.trim()}`,
        });
      }
      if (!account) throw new Error('No account selected');
      await chargeCredit({
        accountId: account.id,
        customerId: String(account.customerId || ''),
        amount: pickedTotal,
        orderId: pickedOrder.id,
        description: `Order #${orderNo(pickedOrder)}`,
        performedBy: user?.id || '',
        performedByName: user?.name || '',
      });
      // Mark the order paid as Credit so it leaves the payments queue.
      await confirmPayment(pickedOrder.id, {
        paymentType: '05',
        paymentBreakdown: [{ method: 'Credit', amount: pickedTotal, reference: `Credit: ${account.customerName}` }],
        confirmedBy: user?.id,
        confirmedByName: user?.name,
      });
      setShowOrderModal(false);
      await loadCreditData();
      if (detailAccount?.id === account.id) await loadAccountTransactions(account.id);
    } catch (err: any) {
      setOrderChargeError(err?.message || 'Failed to charge the order. Check the account history before retrying.');
    } finally {
      setOrderChargeSaving(false);
    }
  };

  const idFromNotes = (notes?: string) => notes?.match(/ID\/Passport:\s*([^|]+)/)?.[1]?.trim();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Credit</h1>
            <p className="text-sm text-slate-400 mt-1">
              Charge unpaid orders to a customer's account, and record repayments.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-9 rounded-lg border border-slate-600 bg-slate-800 px-4 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
            >
              New Account
            </button>
            <button
              type="button"
              onClick={() => void openOrderModal()}
              className="h-9 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition"
            >
              Charge an Order
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-600/30 bg-red-500/10 px-4 py-3 text-red-200">{loadError}</div>
        )}

        {isLoading && !accounts.length ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                  <p className="text-xs text-slate-400">{s.label}</p>
                  <p className={`mt-1 text-xl sm:text-2xl font-semibold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative max-w-md mb-4">
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <svg className="w-5 h-5 absolute left-3 top-2.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Accounts */}
            <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
              <table className="min-w-full divide-y divide-slate-700">
                <thead>
                  <tr>
                    {['Customer', 'Owed', 'Limit', 'Available', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {filteredAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-slate-700/30 cursor-pointer" onClick={() => void openDetail(account)}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-100">{account.customerName}</p>
                        {account.customerPhone && <p className="text-xs text-slate-400">{account.customerPhone}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-rose-300">{formatCurrency(account.currentBalance)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">{formatCurrency(account.creditLimit)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-emerald-300">{formatCurrency(account.availableCredit)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border capitalize ${statusClass(account.status)}`}>{account.status}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); openTransaction(account, 'payment'); }}
                          disabled={account.currentBalance <= 0}
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredAccounts.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  {accounts.length === 0 ? 'No credit accounts yet.' : 'No accounts match your search.'}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Account detail */}
      {detailAccount && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setDetailAccount(null)}>
          <div
            className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{detailAccount.customerName}</h3>
                <p className="text-xs text-slate-400">
                  {[detailAccount.customerPhone, idFromNotes(detailAccount.notes) && `ID ${idFromNotes(detailAccount.notes)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => setDetailAccount(null)} className="text-slate-400 hover:text-white text-sm">Close</button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Owed', value: formatCurrency(detailAccount.currentBalance), color: 'text-rose-300' },
                { label: 'Limit', value: formatCurrency(detailAccount.creditLimit), color: 'text-slate-100' },
                { label: 'Available', value: formatCurrency(detailAccount.availableCredit), color: 'text-emerald-300' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2">
                  <p className="text-xs text-slate-400">{s.label}</p>
                  <p className={`text-sm sm:text-base font-semibold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <button
                onClick={() => openTransaction(detailAccount, 'payment')}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition"
              >
                Record Payment
              </button>
              <button
                onClick={() => void openOrderModal(detailAccount.id)}
                className="rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/25 transition"
              >
                Charge an Order
              </button>
              <button
                onClick={() => openTransaction(detailAccount, 'charge')}
                className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition"
              >
                Add Charge
              </button>
              <button
                onClick={() => openTransaction(detailAccount, 'adjustment')}
                className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition"
              >
                Adjust
              </button>
            </div>

            <h4 className="text-sm font-semibold text-slate-300 mb-2">History</h4>
            {txLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-slate-700/60 rounded-lg border border-slate-700">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full border capitalize ${txClass(tx.type)}`}>{tx.type}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200 truncate">{tx.notes || '—'}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(tx.createdAt)}{(tx.performedByName || tx.performedBy) ? ` · ${tx.performedByName || tx.performedBy}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${tx.type === 'payment' ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {tx.type === 'payment' ? '−' : '+'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charge an order */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setShowOrderModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto space-y-4 rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-800 p-5"
          >
            <h3 className="text-lg font-semibold text-white">Charge an Order to Credit</h3>

            {!pickedOrder ? (
              <>
                <input
                  autoFocus
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search order #, table or customer"
                  className={inputClass}
                />
                {ordersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
                  </div>
                ) : visibleOrders.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No unpaid orders{oq ? ' match your search' : ''}.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-700/60 rounded-lg border border-slate-700">
                    {visibleOrders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setPickedOrder(o)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-700/40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100">{orderLabel(o)}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {orderItems(o).map((i: any) => `${i.quantity ?? 1}× ${i.menuItemName ?? i.menu_item_name ?? 'Item'}`).join(', ') || '—'}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-amber-300">{formatCurrency(orderTotal(o))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{orderLabel(pickedOrder)}</p>
                    <button onClick={() => setPickedOrder(null)} className="text-xs text-slate-400 hover:text-white">Change</button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {orderItems(pickedOrder).map((i: any, idx: number) => (
                      <li key={idx} className="flex justify-between text-xs text-slate-300">
                        <span>{i.quantity ?? 1}× {i.menuItemName ?? i.menu_item_name ?? 'Item'}</span>
                        <span>{formatCurrency(Number(i.totalPrice ?? i.total_price ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t border-slate-700 pt-2 text-sm font-semibold">
                    <span className="text-slate-400">Total</span>
                    <span className="text-amber-300">{formatCurrency(pickedTotal)}</span>
                  </div>
                </div>

                <label className="block text-sm text-slate-300">
                  Charge to
                  <select value={chargeAccountId} onChange={(e) => setChargeAccountId(e.target.value)} className={inputClass}>
                    <option value="">Choose an account…</option>
                    {accounts.filter((a) => a.status === 'active').map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.customerName}{a.customerPhone ? ` (${a.customerPhone})` : ''} — {formatCurrency(a.availableCredit)} available
                      </option>
                    ))}
                    <option value="new">+ New credit account</option>
                  </select>
                </label>

                {chargeAccountId === 'new' && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block col-span-2 text-sm text-slate-300">
                      Customer name
                      <input value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} className={inputClass} />
                    </label>
                    <label className="block text-sm text-slate-300">
                      Phone
                      <input type="tel" value={newAcc.phone} onChange={(e) => setNewAcc({ ...newAcc, phone: e.target.value })} className={inputClass} />
                    </label>
                    <label className="block text-sm text-slate-300">
                      ID / Passport
                      <input value={newAcc.idNumber} onChange={(e) => setNewAcc({ ...newAcc, idNumber: e.target.value })} className={inputClass} />
                    </label>
                    <label className="block col-span-2 text-sm text-slate-300">
                      Credit limit (RWF)
                      <input type="number" min="0" step="100" value={newAcc.limit} onChange={(e) => setNewAcc({ ...newAcc, limit: e.target.value })} placeholder={`At least ${formatCurrency(pickedTotal)}`} className={inputClass} />
                    </label>
                  </div>
                )}

                {orderChargeProblem && chargeAccountId && (
                  <p className="text-xs text-amber-400">{orderChargeProblem}</p>
                )}
              </>
            )}

            {orderChargeError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{orderChargeError}</div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowOrderModal(false)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600">Cancel</button>
              {pickedOrder && (
                <button
                  onClick={() => void handleChargeOrder()}
                  disabled={!!orderChargeProblem || orderChargeSaving}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {orderChargeSaving ? 'Charging…' : `Charge ${formatCurrency(pickedTotal)}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create account */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowCreateModal(false)}>
          <form
            onSubmit={handleCreateAccount}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-5"
          >
            <h3 className="text-lg font-semibold text-white">New Credit Account</h3>
            {createError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{createError}</div>}
            <label className="block text-sm text-slate-300">
              Customer name
              <input autoFocus value={createForm.customerName} onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })} className={inputClass} />
            </label>
            <label className="block text-sm text-slate-300">
              Phone
              <input type="tel" value={createForm.customerPhone} onChange={(e) => setCreateForm({ ...createForm, customerPhone: e.target.value })} className={inputClass} />
            </label>
            <label className="block text-sm text-slate-300">
              ID / Passport
              <input value={createForm.idNumber} onChange={(e) => setCreateForm({ ...createForm, idNumber: e.target.value })} className={inputClass} />
            </label>
            <label className="block text-sm text-slate-300">
              Credit limit (RWF)
              <input type="number" min="0" step="100" value={createForm.creditLimit} onChange={(e) => setCreateForm({ ...createForm, creditLimit: e.target.value })} className={inputClass} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600">Cancel</button>
              <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">Create Account</button>
            </div>
          </form>
        </div>
      )}

      {/* Payment / charge / adjustment */}
      {txAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTxAccount(null)}>
          <form
            onSubmit={handleTransaction}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-5"
          >
            <h3 className="text-lg font-semibold text-white">
              {txType === 'payment' ? 'Record Payment' : txType === 'charge' ? 'Add Charge' : 'Adjust Balance'}
            </h3>
            <p className="text-sm text-slate-400">
              {txAccount.customerName} · owes <span className="text-rose-300 font-medium">{formatCurrency(txAccount.currentBalance)}</span>
            </p>
            {txError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{txError}</div>}
            <label className="block text-sm text-slate-300">
              Amount (RWF)
              <input autoFocus type="number" min="0" step="100" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} className={inputClass} />
            </label>
            {txType === 'payment' ? (
              <>
                <label className="block text-sm text-slate-300">
                  Paid with
                  <select value={txMethod} onChange={(e) => setTxMethod(e.target.value as PayMethod)} className={inputClass}>
                    {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Reference (optional)
                  <input value={txReference} onChange={(e) => setTxReference(e.target.value)} placeholder="e.g. MoMo transaction ID" className={inputClass} />
                </label>
              </>
            ) : (
              <label className="block text-sm text-slate-300">
                {txType === 'charge' ? 'Description' : 'Reason'}
                <input value={txDescription} onChange={(e) => setTxDescription(e.target.value)} className={inputClass} />
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTxAccount(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600">Cancel</button>
              <button type="submit" disabled={txSaving} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                {txSaving ? 'Saving…' : txType === 'payment' ? 'Record Payment' : txType === 'charge' ? 'Add Charge' : 'Apply'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CreditManagement;
