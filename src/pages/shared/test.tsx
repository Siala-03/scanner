import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PackageIcon,
  RefreshCcwIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
  BarChart2Icon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SearchIcon,
  FilterIcon,
  DownloadIcon,
  StarIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SearchBar } from '../../components/ui/SearchBar';
import { Modal } from '../../components/ui/Modal';
import { formatPrice } from '../../utils/currency';
import { menuItems, menuCategories } from '../../data/menuData';
import type {
  InventoryRecord,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockMovement,
  WasteEntry,
  WasteReason,
} from '../../types/inventory';
import {
  ensureInventoryInitialized,
  loadInventoryMap,
  updateInventoryRecord,
  recordManualAdjustment,
  listLowStock,
  loadSuppliers,
  ensureSuppliersInitialized,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  loadPurchaseOrders,
  ensurePurchaseOrdersInitialized,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  loadMovements,
  loadWasteLog,
  recordWaste,
  computeInventoryAnalytics,
} from '../../utils/inventoryStorage';

interface InventoryManagementProps {
  role: 'manager' | 'supervisor';
}

type Tab = 'overview' | 'purchase-orders' | 'suppliers' | 'movements' | 'waste' | 'analytics';

const PO_STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
  sent:      { label: 'Sent',      color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  confirmed: { label: 'Confirmed', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  partial:   { label: 'Partial',   color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  received:  { label: 'Received',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  cancelled: { label: 'Cancelled', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
};

const MOVEMENT_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  purchase:   { label: 'Purchase',   color: 'text-green-400',  icon: <ArrowUpIcon className="w-3.5 h-3.5" /> },
  sale:       { label: 'Sale',       color: 'text-blue-400',   icon: <ArrowDownIcon className="w-3.5 h-3.5" /> },
  adjustment: { label: 'Adjustment', color: 'text-amber-400',  icon: <EditIcon className="w-3.5 h-3.5" /> },
  waste:      { label: 'Waste',      color: 'text-red-400',    icon: <TrashIcon className="w-3.5 h-3.5" /> },
  transfer:   { label: 'Transfer',   color: 'text-purple-400', icon: <TruckIcon className="w-3.5 h-3.5" /> },
  return:     { label: 'Return',     color: 'text-orange-400', icon: <RefreshCcwIcon className="w-3.5 h-3.5" /> },
};

const WASTE_REASONS: WasteReason[] = ['expired', 'spoiled', 'damaged', 'overproduction', 'spillage', 'other'];

// ── Small reusable components ────────────────────────────────────────────────

function StockBar({ stock, threshold, max }: { stock: number; threshold: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (stock / max) * 100) : 0;
  const color = stock === 0 ? 'bg-red-500' : stock <= threshold ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusPill({ status }: { status: PurchaseOrderStatus }) {
  const cfg = PO_STATUS_CONFIG[status];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon key={s} className={`w-3.5 h-3.5 ${s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function InventoryManagement({ role }: InventoryManagementProps) {
  const isManager = role === 'manager';
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Initialize all data on mount
  useEffect(() => {
    ensureInventoryInitialized(menuItems);
    ensureSuppliersInitialized();
    ensurePurchaseOrdersInitialized();
  }, []);

  // ── Overview state ──────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'low' | 'out'>('all');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<InventoryRecord>>({});
  const [adjustModal, setAdjustModal] = useState<{ id: string; name: string; current: number } | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');

  const inventoryRows = useMemo(() => {
    const map = loadInventoryMap();
    const q = query.trim().toLowerCase();
    return menuItems
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
      .filter((i) => categoryFilter === 'all' || i.category === categoryFilter)
      .map((item) => {
        const rec = map[item.id]!;
        const stock = rec?.stock ?? 0;
        const threshold = rec?.lowStockThreshold ?? 0;
        return { item, rec, stock, threshold, isOut: stock === 0, isLow: stock > 0 && stock <= threshold };
      })
      .filter((r) => {
        if (statusFilter === 'ok') return !r.isLow && !r.isOut;
        if (statusFilter === 'low') return r.isLow;
        if (statusFilter === 'out') return r.isOut;
        return true;
      })
      .sort((a, b) => {
        if (a.isOut !== b.isOut) return Number(b.isOut) - Number(a.isOut);
        if (a.isLow !== b.isLow) return Number(b.isLow) - Number(a.isLow);
        return a.item.name.localeCompare(b.item.name);
      });
  }, [query, categoryFilter, statusFilter, tick]);

  const lowStockItems = useMemo(() => listLowStock(menuItems), [tick]);

  const handleSaveRow = (menuItemId: string, name: string) => {
    if (!isManager) return;
    const current = loadInventoryMap()[menuItemId];
    if (!current) return;
    const newStock = editValues.stock !== undefined ? editValues.stock : current.stock;
    if (newStock !== current.stock) {
      recordManualAdjustment(menuItemId, name, newStock, 'Manager');
    }
    updateInventoryRecord(menuItemId, {
      lowStockThreshold: editValues.lowStockThreshold ?? current.lowStockThreshold,
      reorderPoint: editValues.reorderPoint ?? current.reorderPoint,
      reorderQty: editValues.reorderQty ?? current.reorderQty,
      unitCost: editValues.unitCost ?? current.unitCost,
      location: editValues.location ?? current.location,
    });
    setEditingRow(null);
    setEditValues({});
    refresh();
  };

  // ── Purchase Orders state ───────────────────────────────────────────────
  const [poFilter, setPoFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showNewPO, setShowNewPO] = useState(false);
  const [newPO, setNewPO] = useState({ supplierId: '', expectedDelivery: '', notes: '' });
  const [newPOItems, setNewPOItems] = useState<{ menuItemId: string; orderedQty: number; unitCost: number }[]>([]);
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  const purchaseOrders = useMemo(() => {
    const all = loadPurchaseOrders();
    return poFilter === 'all' ? all : all.filter((p) => p.status === poFilter);
  }, [tick, poFilter]);

  const suppliers = useMemo(() => loadSuppliers(), [tick]);

  const handleCreatePO = () => {
    if (!newPO.supplierId || newPOItems.length === 0) return;
    const sup = suppliers.find((s) => s.id === newPO.supplierId);
    if (!sup) return;
    const items = newPOItems.map((i) => {
      const mi = menuItems.find((m) => m.id === i.menuItemId);
      return {
        menuItemId: i.menuItemId,
        menuItemName: mi?.name ?? i.menuItemId,
        orderedQty: i.orderedQty,
        receivedQty: 0,
        unitCost: i.unitCost,
        totalCost: i.orderedQty * i.unitCost,
      };
    });
    createPurchaseOrder({
      supplierId: sup.id,
      supplierName: sup.name,
      status: 'draft',
      items,
      totalCost: items.reduce((s, i) => s + i.totalCost, 0),
      expectedDelivery: newPO.expectedDelivery,
      notes: newPO.notes,
      createdBy: 'Manager',
    });
    setShowNewPO(false);
    setNewPO({ supplierId: '', expectedDelivery: '', notes: '' });
    setNewPOItems([]);
    refresh();
  };

  const handleReceivePO = () => {
    if (!receiveModal) return;
    const items = receiveModal.items.map((i) => ({
      menuItemId: i.menuItemId,
      receivedQty: receiveQtys[i.menuItemId] ?? 0,
    }));
    receivePurchaseOrder(receiveModal.id, items, 'Manager', menuItems);
    setReceiveModal(null);
    setReceiveQtys({});
    refresh();
  };

  // ── Suppliers state ─────────────────────────────────────────────────────
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});

  const handleSaveSupplier = () => {
    if (!supplierForm.name) return;
    if (editingSupplier) {
      updateSupplier(editingSupplier.id, supplierForm as Partial<Supplier>);
    } else {
      addSupplier({
        name: supplierForm.name ?? '',
        contactPerson: supplierForm.contactPerson ?? '',
        email: supplierForm.email ?? '',
        phone: supplierForm.phone ?? '',
        address: supplierForm.address ?? '',
        categories: supplierForm.categories ?? [],
        leadTimeDays: supplierForm.leadTimeDays ?? 3,
        paymentTerms: supplierForm.paymentTerms ?? 'Net 30',
        rating: supplierForm.rating ?? 3,
        isActive: supplierForm.isActive ?? true,
        notes: supplierForm.notes,
      });
    }
    setShowSupplierModal(false);
    setEditingSupplier(null);
    setSupplierForm({});
    refresh();
  };

  // ── Movements state ─────────────────────────────────────────────────────
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');
  const [movementQuery, setMovementQuery] = useState('');

  const movements = useMemo(() => {
    const all = loadMovements();
    const q = movementQuery.trim().toLowerCase();
    return all
      .filter((m) => movementTypeFilter === 'all' || m.type === movementTypeFilter)
      .filter((m) => !q || m.menuItemName.toLowerCase().includes(q) || (m.reference ?? '').toLowerCase().includes(q));
  }, [tick, movementTypeFilter, movementQuery]);

  // ── Waste state ─────────────────────────────────────────────────────────
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({ menuItemId: '', qty: 1, reason: 'expired' as WasteReason, notes: '' });
  const [wasteQuery, setWasteQuery] = useState('');

  const wasteLog = useMemo(() => {
    const all = loadWasteLog();
    const q = wasteQuery.trim().toLowerCase();
    return all.filter((w) => !q || w.menuItemName.toLowerCase().includes(q));
  }, [tick, wasteQuery]);

  const handleRecordWaste = () => {
    if (!wasteForm.menuItemId || wasteForm.qty <= 0) return;
    const mi = menuItems.find((m) => m.id === wasteForm.menuItemId);
    if (!mi) return;
    recordWaste(wasteForm.menuItemId, mi.name, wasteForm.qty, wasteForm.reason, 'Manager', wasteForm.notes || undefined);
    setShowWasteModal(false);
    setWasteForm({ menuItemId: '', qty: 1, reason: 'expired', notes: '' });
    refresh();
  };

  // ── Analytics ───────────────────────────────────────────────────────────
  const analytics = useMemo(() => computeInventoryAnalytics(menuItems), [tick]);

  // ── Tab definitions ─────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview',        label: 'Stock Overview',    icon: <PackageIcon className="w-4 h-4" />,     badge: lowStockItems.length || undefined },
    { id: 'purchase-orders', label: 'Purchase Orders',   icon: <ShoppingCartIcon className="w-4 h-4" /> },
    { id: 'suppliers',       label: 'Suppliers',         icon: <TruckIcon className="w-4 h-4" /> },
    { id: 'movements',       label: 'Stock Movements',   icon: <BarChart2Icon className="w-4 h-4" /> },
    { id: 'waste',           label: 'Waste Log',         icon: <TrashIcon className="w-4 h-4" /> },
    { id: 'analytics',       label: 'Analytics',         icon: <TrendingUpIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <PackageIcon className="w-6 h-6 text-amber-400" />
                Inventory Management
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {isManager ? 'Full control — edit stock, manage suppliers & purchase orders' : 'Read-only view of stock levels and orders'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={refresh}>
                <RefreshCcwIcon className="w-4 h-4" />
              </Button>
              {isManager && activeTab === 'waste' && (
                <Button variant="danger" size="sm" onClick={() => setShowWasteModal(true)}>
                  <PlusIcon className="w-4 h-4" />
                  Log Waste
                </Button>
              )}
              {isManager && activeTab === 'purchase-orders' && (
                <Button variant="primary" size="sm" onClick={() => setShowNewPO(true)}>
                  <PlusIcon className="w-4 h-4" />
                  New PO
                </Button>
              )}
              {isManager && activeTab === 'suppliers' && (
                <Button variant="primary" size="sm" onClick={() => { setEditingSupplier(null); setSupplierForm({}); setShowSupplierModal(true); }}>
                  <PlusIcon className="w-4 h-4" />
                  Add Supplier
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-slate-900'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge ? (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-red-500 text-white font-bold">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">

        {/* ── LOW STOCK BANNER ── */}
        {lowStockItems.length > 0 && activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3"
          >
            <AlertTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="text-red-300 font-semibold mb-1">
                {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} need restocking
              </p>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.slice(0, 6).map((x) => (
                  <span key={x.item.id} className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-200 text-xs">
                    {x.item.name} ({x.stock} left)
                  </span>
                ))}
                {lowStockItems.length > 6 && (
                  <span className="text-red-300/70 text-xs self-center">+{lowStockItems.length - 6} more</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: STOCK OVERVIEW
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Items', value: menuItems.length, icon: <PackageIcon className="w-5 h-5 text-blue-400" />, color: 'text-blue-400' },
                { label: 'Low Stock', value: analytics.lowStockCount, icon: <AlertTriangleIcon className="w-5 h-5 text-amber-400" />, color: 'text-amber-400' },
                { label: 'Out of Stock', value: analytics.outOfStockCount, icon: <XCircleIcon className="w-5 h-5 text-red-400" />, color: 'text-red-400' },
                { label: 'Stock Value', value: formatPrice(analytics.totalStockValue), icon: <TrendingUpIcon className="w-5 h-5 text-emerald-400" />, color: 'text-emerald-400' },
              ].map((kpi) => (
                <Card key={kpi.label} className="bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-700/50">{kpi.icon}</div>
                    <div>
                      <p className="text-xs text-slate-400">{kpi.label}</p>
                      <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <SearchBar value={query} onChange={setQuery} placeholder="Search items..." className="md:w-80" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">All Categories</option>
                {menuCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex gap-1">
                {(['all', 'ok', 'low', 'out'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === s
                        ? 'bg-amber-500 text-slate-900'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    {s === 'all' ? 'All' : s === 'ok' ? 'OK' : s === 'low' ? 'Low' : 'Out'}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <Card className="bg-slate-800/50 border border-slate-700/50" padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/40 border-b border-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock Level</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Thresholds</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Unit Cost</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                      {isManager && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {inventoryRows.map((row) => {
                      const isEditing = editingRow === row.item.id;
                      const maxStock = Math.max(row.rec?.reorderQty ?? 20, row.stock, 1);
                      return (
                        <tr
                          key={row.item.id}
                          className={`transition-colors ${row.isOut ? 'bg-red-500/5' : row.isLow ? 'bg-amber-500/5' : 'hover:bg-slate-700/20'}`}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-white font-medium text-sm">{row.item.name}</p>
                              <p className="text-xs text-slate-500">{row.item.id} · {row.item.category.replace(/-/g, ' ')}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                value={editValues.location ?? row.rec?.location ?? ''}
                                onChange={(e) => setEditValues((v) => ({ ...v, location: e.target.value }))}
                                className="w-28 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            ) : (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <MapPinIcon className="w-3 h-3" />
                                {row.rec?.location ?? '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-[140px]">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={editValues.stock ?? row.stock}
                                    onChange={(e) => setEditValues((v) => ({ ...v, stock: parseInt(e.target.value || '0', 10) }))}
                                    className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    min={0}
                                  />
                                ) : (
                                  <span className={`text-sm font-bold ${row.isOut ? 'text-red-400' : row.isLow ? 'text-amber-400' : 'text-white'}`}>
                                    {row.stock}
                                  </span>
                                )}
                                <span className="text-xs text-slate-500">/ {maxStock}</span>
                              </div>
                              <StockBar stock={row.stock} threshold={row.threshold} max={maxStock} />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <div className="text-center">
                                  <p className="text-xs text-slate-500 mb-0.5">Alert</p>
                                  <input
                                    type="number"
                                    value={editValues.lowStockThreshold ?? row.rec?.lowStockThreshold ?? 0}
                                    onChange={(e) => setEditValues((v) => ({ ...v, lowStockThreshold: parseInt(e.target.value || '0', 10) }))}
                                    className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    min={0}
                                  />
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-500 mb-0.5">Reorder</p>
                                  <input
                                    type="number"
                                    value={editValues.reorderQty ?? row.rec?.reorderQty ?? 0}
                                    onChange={(e) => setEditValues((v) => ({ ...v, reorderQty: parseInt(e.target.value || '0', 10) }))}
                                    className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    min={0}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400 space-y-0.5">
                                <p>Alert at <span className="text-amber-400 font-medium">{row.rec?.lowStockThreshold ?? 0}</span></p>
                                <p>Reorder <span className="text-blue-400 font-medium">{row.rec?.reorderQty ?? 0}</span> units</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValues.unitCost ?? row.rec?.unitCost ?? 0}
                                onChange={(e) => setEditValues((v) => ({ ...v, unitCost: parseInt(e.target.value || '0', 10) }))}
                                className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                min={0}
                              />
                            ) : (
                              <span className="text-sm text-slate-300">{formatPrice(row.rec?.unitCost ?? 0)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {row.isOut ? (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30">Out of Stock</span>
                            ) : row.isLow ? (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">Low Stock</span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">In Stock</span>
                            )}
                          </td>
                          {isManager && (
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSaveRow(row.item.id, row.item.name)}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition"
                                  >
                                    <CheckCircleIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => { setEditingRow(null); setEditValues({}); }}
                                    className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 transition"
                                  >
                                    <XIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingRow(row.item.id);
                                      setEditValues({
                                        stock: row.stock,
                                        lowStockThreshold: row.rec?.lowStockThreshold,
                                        reorderPoint: row.rec?.reorderPoint,
                                        reorderQty: row.rec?.reorderQty,
                                        unitCost: row.rec?.unitCost,
                                        location: row.rec?.location,
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-amber-400 hover:bg-slate-600 transition"
                                    title="Edit"
                                  >
                                    <EditIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAdjustModal({ id: row.item.id, name: row.item.name, current: row.stock });
                                      setAdjustQty('');
                                      setAdjustNotes('');
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-blue-400 hover:bg-slate-600 transition"
                                    title="Quick Adjust"
                                  >
                                    <ArrowUpIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {inventoryRows.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No items match your filters.</div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: PURCHASE ORDERS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'purchase-orders' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* PO KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total POs', value: loadPurchaseOrders().length, color: 'text-white' },
                { label: 'Pending', value: analytics.pendingPOCount, color: 'text-amber-400' },
                { label: 'Pending Value', value: formatPrice(analytics.pendingPOValue), color: 'text-amber-400' },
                { label: 'Received This Month', value: loadPurchaseOrders().filter((p) => p.status === 'received').length, color: 'text-emerald-400' },
              ].map((kpi) => (
                <Card key={kpi.label} className="bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                </Card>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {(['all', 'draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPoFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    poFilter === s ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  {s === 'all' ? 'All' : PO_STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {purchaseOrders.map((po) => (
                <Card key={po.id} className="bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition cursor-pointer" onClick={() => setSelectedPO(po)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white text-sm">{po.id}</span>
                        <StatusPill status={po.status} />
                      </div>
                      <p className="text-slate-300 text-sm">{po.supplierName}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {po.items.length} item{po.items.length !== 1 ? 's' : ''} · Expected {po.expectedDelivery}
                        {po.notes && <span className="ml-2 italic">"{po.notes}"</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-amber-400 font-bold">{formatPrice(po.totalCost)}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Created {new Date(po.createdAt).toLocaleDateString()}
                      </p>
                      {isManager && (po.status === 'confirmed' || po.status === 'sent' || po.status === 'partial') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiveModal(po);
                            setReceiveQtys(Object.fromEntries(po.items.map((i) => [i.menuItemId, i.orderedQty - i.receivedQty])));
                          }}
                          className="mt-2 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
                        >
                          Receive Delivery
                        </button>
                      )}
                      {isManager && po.status === 'draft' && (
                        <div className="flex gap-1 mt-2 justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); updatePurchaseOrder(po.id, { status: 'sent' }); refresh(); }}
                            className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition"
                          >
                            Send PO
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); updatePurchaseOrder(po.id, { status: 'cancelled' }); refresh(); }}
                            className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {purchaseOrders.length === 0 && (
                <div className="py-16 text-center text-slate-500">No purchase orders found.</div>
              )}
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: SUPPLIERS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'suppliers' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map((sup) => (
                <Card key={sup.id} className="bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-white">{sup.name}</h3>
                      <StarRating rating={sup.rating} />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${sup.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                      {sup.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm mb-3">
                    <div className="flex items-center gap-2 text-slate-400">
                      <MailIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{sup.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{sup.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="text-xs">Lead time: {sup.leadTimeDays} days</span>
                      <span className="text-xs">Terms: {sup.paymentTerms}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sup.categories.map((c) => (
                        <span key={c} className="px-1.5 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300 border border-slate-600">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  {sup.notes && (
                    <p className="text-xs text-slate-500 italic mb-3">{sup.notes}</p>
                  )}
                  {isManager && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingSupplier(sup); setSupplierForm({ ...sup }); setShowSupplierModal(true); }}
                        className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { updateSupplier(sup.id, { isActive: !sup.isActive }); refresh(); }}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                          sup.isActive ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                        }`}
                      >
                        {sup.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </Card>
              ))}
              {suppliers.length === 0 && (
                <div className="py-16 text-center text-slate-500">No suppliers found.</div>
              )}
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: STOCK MOVEMENTS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'movements' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <SearchBar value={movementQuery} onChange={setMovementQuery} placeholder="Search movements..." className="md:w-80" />
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">All Types</option>
                {Object.entries(MOVEMENT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <Card className="bg-slate-800/50 border border-slate-700/50" padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/40 border-b border-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {movements.map((m) => {
                      const cfg = MOVEMENT_CONFIG[m.type] ?? { label: m.type, color: 'text-slate-400', icon: null };
                      return (
                        <tr key={m.id} className="hover:bg-slate-700/20">
                          <td className="px-4 py-3">
                            <p className="text-xs text-slate-400">{new Date(m.timestamp).toLocaleString()}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-white">{m.menuItemName}</p>
                            <p className="text-xs text-slate-500">{m.menuItemId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                              {cfg.icon}
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${m.qty > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {m.qty > 0 ? '+' : ''}{m.qty}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-300">{m.balanceAfter}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-400">{m.reference ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-400">{m.notes ?? '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {movements.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No movements found.</div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: WASTE LOG
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'waste' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <SearchBar value={wasteQuery} onChange={setWasteQuery} placeholder="Search waste entries..." className="md:w-80" />
            </div>
            <Card className="bg-slate-800/50 border border-slate-700/50" padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/40 border-b border-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {wasteLog.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-700/20">
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-400">{new Date(w.timestamp).toLocaleString()}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-white">{w.menuItemName}</p>
                          <p className="text-xs text-slate-500">{w.menuItemId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-red-400">{w.qty}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400 capitalize">{w.reason}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400">{w.notes ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400">{w.recordedBy}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {wasteLog.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No waste entries found.</div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: ANALYTICS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              {[
                { label: 'Total Stock Value', value: formatPrice(analytics.totalStockValue), color: 'text-emerald-400' },
                { label: 'Average Turnover Days', value: analytics.avgTurnoverDays.toFixed(1), color: 'text-blue-400' },
                { label: 'Waste Cost (Last 30d)', value: formatPrice(analytics.wasteCostLast30d), color: 'text-red-400' },
                { label: 'Pending PO Value', value: formatPrice(analytics.pendingPOValue), color: 'text-amber-400' },
                { label: 'Items Below Reorder', value: analytics.belowReorderCount, color: 'text-orange-400' },
                { label: 'Top Waste Reason', value: analytics.topWasteReason || '—', color: 'text-red-400' },
              ].map((kpi) => (
                <Card key={kpi.label} className="bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* Top waste reasons */}
              <Card className="bg-slate-800/50 border border-slate-700/50">
                <h3 className="font-bold text-white mb-3">Waste Reasons (Last 30d)</h3>
                <div className="space-y-2">
                  {analytics.wasteByReason.map((r) => (
                    <div key={r.reason} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300 capitalize">{r.reason}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">{r.qty} units</span>
                        <span className="text-sm text-red-400">{formatPrice(r.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Top waste items */}
              <Card className="bg-slate-800/50 border border-slate-700/50">
                <h3 className="font-bold text-white mb-3">Top Waste Items (Last 30d)</h3>
                <div className="space-y-2">
                  {analytics.topWasteItems.map((i) => (
                    <div key={i.menuItemId} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{i.menuItemName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">{i.qty} units</span>
                        <span className="text-sm text-red-400">{formatPrice(i.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODALS
        ════════════════════════════════════════════════════════════════ */}
        {/* PO Detail Modal */}
        <Modal isOpen={!!selectedPO} onClose={() => setSelectedPO(null)} title={`PO ${selectedPO?.id}`}>
          {selectedPO && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-300">{selectedPO.supplierName}</p>
                  <p className="text-xs text-slate-500">Expected {selectedPO.expectedDelivery}</p>
                </div>
                <StatusPill status={selectedPO.status} />
              </div>
              <div className="space-y-2">
                {selectedPO.items.map((i) => (
                  <div key={i.menuItemId} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                    <div>
                      <p className="text-sm text-white">{i.menuItemName}</p>
                      <p className="text-xs text-slate-500">{i.menuItemId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-300">{i.orderedQty} ordered · {i.receivedQty} received</p>
                      <p className="text-xs text-slate-500">{formatPrice(i.unitCost)} each</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-700/30">
                <p className="text-slate-400 text-sm">Total: {formatPrice(selectedPO.totalCost)}</p>
                {isManager && (selectedPO.status === 'confirmed' || selectedPO.status === 'sent' || selectedPO.status === 'partial') && (
                  <button
                    onClick={() => {
                      setReceiveModal(selectedPO);
                      setReceiveQtys(Object.fromEntries(selectedPO.items.map((i) => [i.menuItemId, i.orderedQty - i.receivedQty])));
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
                  >
                    Receive Delivery
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Receive PO Modal */}
        <Modal isOpen={!!receiveModal} onClose={() => setReceiveModal(null)} title={`Receive PO ${receiveModal?.id}`}>
          {receiveModal && (
            <div className="space-y-3">
              <p className="text-slate-400">Confirm quantities received for each item.</p>
              <div className="space-y-2">
                {receiveModal.items.map((i) => (
                  <div key={i.menuItemId} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                    <div className="flex-1">
                      <p className="text-sm text-white">{i.menuItemName}</p>
                      <p className="text-xs text-slate-500">Ordered: {i.orderedQty} · Received: {i.receivedQty}</p>
                    </div>
                    <input
                      type="number"
                      value={receiveQtys[i.menuItemId] ?? 0}
                      onChange={(e) => setReceiveQtys((v) => ({ ...v, [i.menuItemId]: parseInt(e.target.value || '0', 10) }))}
                      min={0}
                      max={i.orderedQty - i.receivedQty}
                      className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-700/30">
                <p className="text-slate-400 text-sm">Total to receive: {Object.values(receiveQtys).reduce((s, v) => s + v, 0)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReceiveModal(null)}
                    className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReceivePO}
                    className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
                  >
                    Confirm Receive
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* New PO Modal */}
        <Modal isOpen={showNewPO} onClose={() => setShowNewPO(false)} title="New Purchase Order">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newPO.supplierId}
                onChange={(e) => setNewPO((v) => ({ ...v, supplierId: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={newPO.expectedDelivery}
                onChange={(e) => setNewPO((v) => ({ ...v, expectedDelivery: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={newPO.notes}
              onChange={(e) => setNewPO((v) => ({ ...v, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={2}
            />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-slate-400 text-sm">Items</p>
                <button
                  onClick={() => setNewPOItems((v) => [...v, { menuItemId: '', orderedQty: 1, unitCost: 0 }])}
                  className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                >
                  Add Item
                </button>
              </div>
              {newPOItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                  <select
                    value={item.menuItemId}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, menuItemId: e.target.value } : i))}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select Item</option>
                    {menuItems.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.orderedQty}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, orderedQty: parseInt(e.target.value || '0', 10) } : i))}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    min={1}
                  />
                  <input
                    type="number"
                    placeholder="Unit Cost"
                    value={item.unitCost}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, unitCost: parseInt(e.target.value || '0', 10) } : i))}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    min={0}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-700/30">
              <p className="text-slate-400 text-sm">Total: {formatPrice(newPOItems.reduce((s, i) => s + i.orderedQty * i.unitCost, 0))}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewPO(false)}
                  className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePO}
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
                >
                  Create PO
                </button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Supplier Modal */}
        <Modal isOpen={showSupplierModal} onClose={() => { setShowSupplierModal(false); setEditingSupplier(null); setSupplierForm({}); }} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Supplier Name"
                value={supplierForm.name ?? ''}
                onChange={(e) => setSupplierForm((v) => ({ ...v, name: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                placeholder="Contact Person"
                value={supplierForm.contactPerson ?? ''}
                onChange={(e) => setSupplierForm((v) => ({ ...v, contactPerson: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Email"
                value={supplierForm.email ?? ''}
                onChange={(e) => setSupplierForm((v) => ({ ...v, email: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                placeholder="Phone"
                value={supplierForm.phone ?? ''}
                onChange={(e) => setSupplierForm((v) => ({ ...v, phone: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <textarea
              placeholder="Address"
              value={supplierForm.address ?? ''}
              onChange={(e) => setSupplierForm((v) => ({ ...v, address: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Lead Time (days)"
                value={supplierForm.leadTimeDays ?? ''}
                onChange={(e) => setSupplierForm((v) => ({ ...v, leadTimeDays: parseInt(e.target.value || '0', 10) }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                min={1}
              />
              <input
                placeholder="Payment Terms"
                value={supplierForm.paymentTerms ?? ''}
                onChange={(e) => setSupplierForm((v) => ({ ...v, paymentTerms: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={supplierForm.rating ?? 3}
                onChange={(e) => setSupplierForm((v) => ({ ...v, rating: parseInt(e.target.value, 10) }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r} Stars</option>)}
              </select>
              <label className="flex items-center gap-2 text-slate-300 text-sm">
                <input
                  type="checkbox"
                  checked={supplierForm.isActive ?? true}
                  onChange={(e) => setSupplierForm((v) => ({ ...v, isActive: e.target.checked }))}
                  className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                Active
              </label>
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={supplierForm.notes ?? ''}
              onChange={(e) => setSupplierForm((v) => ({ ...v, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={2}
            />
            <div className="flex justify-between items-center pt-3 border-t border-slate-700/30">
              <p className="text-slate-400 text-sm">Categories</p>
              <div className="flex flex-wrap gap-1">
                {menuCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-1 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={(supplierForm.categories ?? []).includes(c.id)}
                      onChange={(e) => {
                        const cats = supplierForm.categories ?? [];
                        const newCats = e.target.checked ? [...cats, c.id] : cats.filter((x) => x !== c.id);
                        setSupplierForm((v) => ({ ...v, categories: newCats }));
                      }}
                      className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/30">
              <button
                onClick={() => { setShowSupplierModal(false); setEditingSupplier(null); setSupplierForm({}); }}
                className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSupplier}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>

        {/* Quick Adjust Modal */}
        <Modal isOpen={!!adjustModal} onClose={() => setAdjustModal(null)} title={`Adjust Stock: ${adjustModal?.name}`}>
          {adjustModal && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-slate-400 text-sm">Current Stock</p>
                  <p className="text-xl font-bold text-white">{adjustModal.current}</p>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">New Quantity</label>
                  <input
                    type="number"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    min={0}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                rows={2}
              />
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/30">
                <button
                  onClick={() => setAdjustModal(null)}
                  className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const qty = parseInt(adjustQty || '0', 10);
                    if (qty >= 0) {
                      recordManualAdjustment(adjustModal.id, adjustModal.name, qty, 'Manager', adjustNotes || undefined);
                      setAdjustModal(null);
                      setAdjustQty('');
                      setAdjustNotes('');
                      refresh();
                    }
                  }}
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
                >
                  Adjust
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Waste Modal */}
        <Modal isOpen={showWasteModal} onClose={() => setShowWasteModal(false)} title="Log Waste">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={wasteForm.menuItemId}
                onChange={(e) => setWasteForm((v) => ({ ...v, menuItemId: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select Item</option>
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Quantity"
                value={wasteForm.qty}
                onChange={(e) => setWasteForm((v) => ({ ...v, qty: parseInt(e.target.value || '0', 10) }))}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                min={1}
              />
            </div>
            <select
              value={wasteForm.reason}
              onChange={(e) => setWasteForm((v) => ({ ...v, reason: e.target.value as WasteReason }))}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {WASTE_REASONS.map((r) => (
                <option key={r} value={r}>{r.replace(/-/g, ' ')}</option>
              ))}
            </select>
            <textarea
              placeholder="Notes (optional)"
              value={wasteForm.notes}
              onChange={(e) => setWasteForm((v) => ({ ...v, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={2}
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/30">
              <button
                onClick={() => setShowWasteModal(false)}
                className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordWaste}
                className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition"
              >
                Record Waste
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
