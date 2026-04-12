import React, { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  PackageIcon,
  RefreshCcwIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  TruckIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  StarIcon,
  MapPinIcon,
  MailIcon,
  XIcon,
  BellIcon,
} from 'lucide-react';
import { InventoryForecasting } from '../../components/manager/InventoryForecasting';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SearchBar } from '../../components/ui/SearchBar';
import { Modal } from '../../components/ui/Modal';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';
import { useInventoryData } from '../../hooks/useInventory';
import type {
  InventoryRecord,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  WasteReason,
} from '../../types/inventory';
import {
  updateInventoryRecord as apiUpdateInventoryRecord,
  deleteInventoryRecord as apiDeleteInventoryRecord,
  createSupplier as apiCreateSupplier,
  updateSupplier as apiUpdateSupplier,
  createPurchaseOrder as apiCreatePurchaseOrder,
  updatePurchaseOrder as apiUpdatePurchaseOrder,
  receivePurchaseOrder as apiReceivePurchaseOrder,
  recordWaste as apiRecordWaste,
} from '../../api/inventory';

interface InventoryManagementProps {
  role: 'manager' | 'supervisor';
}

type Tab = 'overview' | 'purchase-orders' | 'suppliers' | 'waste' | 'forecasting' | 'locations';

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════════════════════

const PO_STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
  sent:      { label: 'Sent',      color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  confirmed: { label: 'Confirmed', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  partial:   { label: 'Partial',   color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  received:  { label: 'Received',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  cancelled: { label: 'Cancelled', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
};

const WASTE_REASONS: WasteReason[] = ['expired', 'spoiled', 'damaged', 'overproduction', 'spillage', 'other'];

// ════════════════════════════════════════════════════════════════════════════
// REUSABLE UI COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Normalize inventory record with robust field name handling
 */
function normalizeInventoryRecord(rec: any): InventoryRecord {
  if (!rec) return { menuItemId: '', stock: 0, lowStockThreshold: 0, reorderPoint: 0, reorderQty: 0, unitCost: 0, location: '', updatedAt: new Date().toISOString() };
  
  const menuItemId = rec.menuItemId || rec.menu_item_id || rec.itemId || rec.item_id || '';
  
  return {
    menuItemId: menuItemId,
    stock: rec.stock ?? 0,
    lowStockThreshold: rec.lowStockThreshold ?? rec.low_stock_threshold ?? 0,
    reorderPoint: rec.reorderPoint ?? rec.reorder_point ?? 0,
    reorderQty: rec.reorderQty ?? rec.reorder_qty ?? 0,
    unitCost: rec.unitCost ?? rec.unit_cost ?? 0,
    location: rec.location ?? '',
    updatedAt: rec.updatedAt ?? rec.updated_at ?? new Date().toISOString(),
  };
}

/**
 * Create a map of normalized inventory records for O(1) lookup
 */
function buildInventoryMap(inventory: any[]): Record<string, InventoryRecord> {
  const map: Record<string, InventoryRecord> = {};
  
  inventory.forEach(rec => {
    const normalized = normalizeInventoryRecord(rec);
    if (normalized.menuItemId) {
      map[normalized.menuItemId] = normalized;
    }
  });
  
  if (Object.keys(map).length === 0 && inventory.length > 0) {
    console.warn('⚠️ No valid inventory items after normalization. Inventory count:', inventory.length);
    console.warn('Sample record:', inventory[0]);
  }
  
  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export function InventoryManagement({ role }: InventoryManagementProps) {
  const { menuItems } = useMenu();
  const {
    inventory,
    lowStockItems,
    suppliers,
    purchaseOrders,
    movements,
    waste,
    analytics,
    alerts: inventoryAlerts,
    forecasts,
    forecastAlerts,
    isGeneratingForecasts,
    runForecasting,
    isLoading,
    loadError,
    refresh,
    locations,
  } = useInventoryData();

  // ── UI State ─────────────────────────────────────────────────────────────
  const isManager = role === 'manager';
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── Inventory Edit State ──────────────────────────────────────────────────
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<InventoryRecord>>({});

  // ── Supplier Management State ─────────────────────────────────────────────
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});

  // ── Purchase Order State ──────────────────────────────────────────────────
  const [showNewPO, setShowNewPO] = useState(false);
  const [newPO, setNewPO] = useState({ supplierId: '', expectedDelivery: '', notes: '' });
  const [newPOItems, setNewPOItems] = useState<{ menuItemId: string; orderedQty: number; unitCost: number }[]>([]);

  // ── Waste Tracking State ──────────────────────────────────────────────────
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({ menuItemId: '', qty: 1, reason: 'expired' as WasteReason, notes: '' });

  // ── Derived Data ──────────────────────────────────────────────────────────
  const menuCategories = useMemo(() => Array.from(new Set(menuItems.map((m) => m.category))), [menuItems]);
  const inventoryMap = useMemo(() => buildInventoryMap(inventory), [inventory]);

  const inventoryRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menuItems
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
      .filter((i) => categoryFilter === 'all' || i.category === categoryFilter)
      .filter((i) => locationFilter === 'all' || (inventoryMap[i.id]?.location || '').toLowerCase() === locationFilter.toLowerCase())
      .map((item) => {
        const rec = inventoryMap[item.id];
        const stock = rec?.stock ?? 0;
        const threshold = rec?.lowStockThreshold ?? 0;
        const maxStock = Math.max(rec?.reorderQty ?? (stock * 2 || 20), stock, 1);
        const lastUpdatedDays = rec?.updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(rec.updatedAt).getTime()) / (1000 * 60 * 60 * 24))) : null;
        return {
          item,
          rec,
          stock,
          threshold,
          maxStock,
          isOut: stock === 0,
          isLow: stock > 0 && stock <= threshold,
          lastUpdatedDays,
        };
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
  }, [query, categoryFilter, locationFilter, statusFilter, menuItems, inventoryMap]);

  // ════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ════════════════════════════════════════════════════════════════════════════

  const handleSaveRow = useCallback(async (menuItemId: string, itemName: string) => {
    if (!isManager) return;
    
    console.log('💾 Saving inventory:', { menuItemId, itemName, editValues, currentInventory: inventoryMap[menuItemId] });

    // Build the update payload with all current values
    const updateData = {
      stock: editValues.stock ?? inventoryMap[menuItemId]?.stock ?? 0,
      low_stock_threshold: editValues.lowStockThreshold ?? inventoryMap[menuItemId]?.lowStockThreshold ?? 0,
      reorder_point: editValues.reorderPoint ?? inventoryMap[menuItemId]?.reorderPoint ?? 0,
      reorder_qty: editValues.reorderQty ?? inventoryMap[menuItemId]?.reorderQty ?? 0,
      unit_cost: editValues.unitCost ?? inventoryMap[menuItemId]?.unitCost ?? 0,
      location: editValues.location ?? inventoryMap[menuItemId]?.location ?? '',
    };

    try {
      console.log('📤 Sending to backend:', { menuItemId, data: updateData });
      await apiUpdateInventoryRecord(menuItemId, updateData);
      
      console.log('✅ Update successful, refreshing data...');
      await refresh();
      
      alert('✅ Inventory updated successfully');
      setEditingRow(null);
      setEditValues({});
    } catch (err) {
      console.error('❌ Update failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`❌ Failed to update: ${msg}`);
    }
  }, [isManager, inventoryMap, refresh]);

  const handleDeleteInventoryItem = useCallback(async (menuItemId: string) => {
    if (!isManager) return;
    if (!window.confirm('Are you sure? This will delete all stock data for this item.')) return;

    try {
      await apiDeleteInventoryRecord(menuItemId);
      await refresh();
      alert('✅ Inventory item deleted');
    } catch (err) {
      alert(`❌ Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [isManager, refresh]);

  const handleSaveSupplier = useCallback(async () => {
    if (!supplierForm.name) {
      alert('⚠️ Please enter supplier name');
      return;
    }

    const payload = {
      name: supplierForm.name,
      contactPerson: supplierForm.contactPerson ?? '',
      email: supplierForm.email ?? '',
      phone: supplierForm.phone ?? '',
      address: supplierForm.address ?? '',
      categories: supplierForm.categories ?? [],
      leadTimeDays: supplierForm.leadTimeDays ?? 3,
      paymentTerms: supplierForm.paymentTerms ?? 'Net 30',
      rating: supplierForm.rating ?? 3,
      isActive: supplierForm.isActive ?? true,
      notes: supplierForm.notes ?? '',
    };

    try {
      if (editingSupplier) {
        await apiUpdateSupplier(editingSupplier.id, payload);
        console.log('✅ Supplier updated:', editingSupplier.id);
      } else {
        await apiCreateSupplier(payload);
        console.log('✅ Supplier created');
      }
      await refresh();
      alert('✅ Supplier saved successfully');
      setShowSupplierModal(false);
      setEditingSupplier(null);
      setSupplierForm({});
    } catch (err) {
      alert(`❌ Failed to save supplier: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [supplierForm, editingSupplier, refresh]);

  const handleCreatePO = useCallback(async () => {
    if (!newPO.supplierId) {
      alert('⚠️ Please select a supplier');
      return;
    }
    if (newPOItems.length === 0) {
      alert('⚠️ Please add at least one item');
      return;
    }
    if (newPOItems.some(i => !i.menuItemId || i.orderedQty <= 0)) {
      alert('⚠️ Please fill in all item details');
      return;
    }

    const supplier = suppliers.find(s => s.id === newPO.supplierId);
    if (!supplier) {
      alert('⚠️ Selected supplier not found');
      return;
    }

    try {
      console.log('📦 Creating purchase order:', { supplier: supplier.name, itemCount: newPOItems.length });
      
      const createdPO = await apiCreatePurchaseOrder({
        supplierId: supplier.id,
        supplierName: supplier.name,
        items: newPOItems.map((i) => ({
          menuItemId: i.menuItemId,
          menuItemName: menuItems.find((m) => m.id === i.menuItemId)?.name ?? i.menuItemId,
          orderedQty: i.orderedQty,
          receivedQty: 0,
          unitCost: i.unitCost,
          totalCost: i.orderedQty * i.unitCost,
        })),
        expectedDelivery: newPO.expectedDelivery,
        notes: newPO.notes,
        createdBy: 'Manager',
      } as any);

      console.log('✅ Purchase order created:', createdPO.id);
      
      // Send notification to supplier
      try {
        console.log('📧 Supplier notification triggered for:', supplier.email);
        // Backend will emit socket event to supplier automatically
      } catch (err) {
        console.error('Supplier notification failed (non-blocking):', err);
      }

      await refresh();
      alert('✅ Purchase order created successfully');
      setShowNewPO(false);
      setNewPO({ supplierId: '', expectedDelivery: '', notes: '' });
      setNewPOItems([]);
    } catch (err) {
      console.error('❌ PO creation failed:', err);
      alert(`❌ Failed to create PO: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [newPO, newPOItems, suppliers, menuItems, refresh]);

  const handleRecordWaste = useCallback(async () => {
    if (!wasteForm.menuItemId || wasteForm.qty <= 0) {
      alert('⚠️ Please select item and enter quantity');
      return;
    }

    const item = menuItems.find(m => m.id === wasteForm.menuItemId);
    if (!item) {
      alert('⚠️ Item not found');
      return;
    }

    try {
      console.log('🗑️ Recording waste:', { item: item.name, qty: wasteForm.qty, reason: wasteForm.reason });
      
      await apiRecordWaste({
        menu_item_id: wasteForm.menuItemId,
        menu_item_name: item.name,
        qty: wasteForm.qty,
        unit_cost: inventoryMap[wasteForm.menuItemId]?.unitCost ?? 0,
        reason: wasteForm.reason,
        reported_by: 'Manager',
        recorded_by: 'Manager',
        notes: wasteForm.notes,
      });

      console.log('✅ Waste recorded');
      await refresh();
      alert('✅ Waste recorded successfully');
      setShowWasteModal(false);
      setWasteForm({ menuItemId: '', qty: 1, reason: 'expired', notes: '' });
    } catch (err) {
      alert(`❌ Failed to record waste: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [wasteForm, menuItems, inventoryMap, refresh]);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <RefreshCcwIcon className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400">Loading inventory...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="border border-red-500/30 bg-red-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-red-400 mb-1">Failed to load inventory</h3>
            <p className="text-sm text-red-300 mb-3">{loadError}</p>
            <Button onClick={refresh} variant="outline" size="sm">Retry</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <PackageIcon className="w-8 h-8 text-amber-400" />
            Inventory Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isManager ? 'Full control — edit stock, manage suppliers & purchase orders' : 'Read-only view of stock levels and orders'}
          </p>
        </div>
        <Button onClick={refresh} variant="outline" className="gap-2">
          <RefreshCcwIcon className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-3 overflow-x-auto">
        {(['overview', 'purchase-orders', 'suppliers', 'waste', 'forecasting'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition whitespace-nowrap ${
              activeTab === tab
                ? 'bg-slate-700/50 border-b-2 border-amber-400 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-4">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <div className="text-slate-400 text-sm mb-1">Total Stock Value</div>
              <div className="text-2xl font-bold text-white">{formatPrice(analytics.totalStockValue)}</div>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <div className="text-slate-400 text-sm mb-1">Low Stock Items</div>
              <div className="text-2xl font-bold text-amber-400">{analytics.lowStockCount}</div>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <div className="text-slate-400 text-sm mb-1">Out of Stock</div>
              <div className="text-2xl font-bold text-red-400">{analytics.outOfStockCount}</div>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <div className="text-slate-400 text-sm mb-1">Waste (30d)</div>
              <div className="text-2xl font-bold text-orange-400">{formatPrice(analytics.wasteCostLast30d)}</div>
            </Card>
          </div>

          {/* Search & Filters */}
          <Card className="bg-slate-800/50 border-slate-700/50 p-4">
            <div className="space-y-3">
              <SearchBar placeholder="Search by item name or ID..." value={query} onChange={setQuery} />
              <div className="grid md:grid-cols-3 gap-3">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                  <option value="all">All Categories</option>
                  {menuCategories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                  <option value="all">All Statuses</option>
                  <option value="ok">OK</option>
                  <option value="low">Low</option>
                  <option value="out">Out</option>
                </select>
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                  <option value="all">All Locations</option>
                  {Array.from(new Set(inventory.map((i: any) => i.location))).filter(Boolean).map(loc => (<option key={loc as string} value={loc as string}>{loc as string}</option>))}
                </select>
              </div>
            </div>
          </Card>

          {/* Inventory Table */}
          <Card className="bg-slate-800/50 border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-900/50">
                    <th className="px-4 py-3 text-left text-slate-400">Item</th>
                    <th className="px-4 py-3 text-left text-slate-400">Stock</th>
                    <th className="px-4 py-3 text-left text-slate-400">Threshold</th>
                    <th className="px-4 py-3 text-left text-slate-400">Cost</th>
                    <th className="px-4 py-3 text-left text-slate-400">Location</th>
                    {isManager && <th className="px-4 py-3 text-left text-slate-400">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map((row) => (
                    <tr key={row.item.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-white">{row.item.name}</div>
                          <div className="text-xs text-slate-500">{row.item.id}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {editingRow === row.item.id ? (
                          <input type="number" value={editValues.stock ?? row.stock} onChange={(e) => setEditValues(v => ({ ...v, stock: parseInt(e.target.value || '0', 10) }))} className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-sm" min="0" />
                        ) : (
                          <span className={`font-semibold ${row.isOut ? 'text-red-400' : row.isLow ? 'text-amber-400' : 'text-emerald-400'}`}>{row.stock}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.threshold}</td>
                      <td className="px-4 py-3 text-slate-300">{formatPrice(row.rec?.unitCost ?? 0)}</td>
                      <td className="px-4 py-3 text-slate-300">{row.rec?.location || '-'}</td>
                      {isManager && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {editingRow === row.item.id ? (
                              <>
                                <button onClick={() => handleSaveRow(row.item.id, row.item.name)} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500">Save</button>
                                <button onClick={() => { setEditingRow(null); setEditValues({}); }} className="px-2 py-1 rounded bg-slate-700 text-slate-300 text-xs hover:bg-slate-600">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditingRow(row.item.id); setEditValues({ stock: row.stock, lowStockThreshold: row.rec?.lowStockThreshold, reorderPoint: row.rec?.reorderPoint, reorderQty: row.rec?.reorderQty, unitCost: row.rec?.unitCost, location: row.rec?.location }); }} className="p-1.5 rounded bg-slate-700 text-slate-400 hover:text-amber-400 hover:bg-slate-600"><EditIcon className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteInventoryItem(row.item.id)} className="p-1.5 rounded bg-slate-700 text-slate-400 hover:text-red-400 hover:bg-slate-600"><TrashIcon className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inventoryRows.length === 0 && <div className="p-8 text-center text-slate-500">No items found</div>}
          </Card>
        </motion.div>
      )}

      {/* Tab: Purchase Orders */}
      {activeTab === 'purchase-orders' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {isManager && <Button onClick={() => setShowNewPO(true)} className="gap-2"><PlusIcon className="w-4 h-4" />New Purchase Order</Button>}
          <div className="grid gap-4">
            {purchaseOrders.map(po => (
              <Card key={po.id} className="bg-slate-800/50 border-slate-700/50 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white">{po.supplierName}</h3>
                    <p className="text-xs text-slate-500">PO #{po.id}</p>
                  </div>
                  <StatusPill status={po.status} />
                </div>
                <div className="grid md:grid-cols-3 gap-3 text-sm mb-3">
                  <div><span className="text-slate-400">Items:</span> <span className="text-white">{po.items?.length ?? 0}</span></div>
                  <div><span className="text-slate-400">Total:</span> <span className="text-white">{formatPrice(po.totalCost)}</span></div>
                  <div><span className="text-slate-400">Expected:</span> <span className="text-white">{po.expectedDelivery ?? '-'}</span></div>
                </div>
                {po.notes && <p className="text-xs text-slate-500 italic mb-3">{po.notes}</p>}
              </Card>
            ))}
            {purchaseOrders.length === 0 && <div className="p-8 text-center text-slate-500">No purchase orders</div>}
          </div>
        </motion.div>
      )}

      {/* Tab: Suppliers */}
      {activeTab === 'suppliers' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {isManager && <Button onClick={() => { setEditingSupplier(null); setSupplierForm({}); setShowSupplierModal(true); }} className="gap-2"><PlusIcon className="w-4 h-4" />Add Supplier</Button>}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map(sup => (
              <Card key={sup.id} className="bg-slate-800/50 border-slate-700/50 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white">{sup.name}</h3>
                    <StarRating rating={sup.rating} />
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${sup.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                    {sup.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="space-y-1 text-sm mb-3 text-slate-300">
                  <div className="flex items-center gap-2"><MailIcon className="w-3.5 h-3.5" />{sup.email}</div>
                  <div className="flex items-center gap-2"><MapPinIcon className="w-3.5 h-3.5" />{sup.address}</div>
                </div>
                {isManager && (
                  <div className="flex gap-2">
                    <Button onClick={() => { setEditingSupplier(sup); setSupplierForm(sup); setShowSupplierModal(true); }} variant="outline" size="sm" className="flex-1">Edit</Button>
                    <Button onClick={async () => { try { await apiUpdateSupplier(sup.id, { isActive: !sup.isActive }); await refresh(); alert(`✅ Supplier ${sup.isActive ? 'deactivated' : 'activated'}`); } catch (err) { alert(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`); } }} size="sm" className={`flex-1 ${sup.isActive ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}>
                      {sup.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
            {suppliers.length === 0 && <div className="p-8 text-center text-slate-500">No suppliers found</div>}
          </div>
        </motion.div>
      )}

      {/* Tab: Waste */}
      {activeTab === 'waste' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {isManager && <Button onClick={() => setShowWasteModal(true)} className="gap-2"><PlusIcon className="w-4 h-4" />Record Waste</Button>}
          <div className="grid gap-4">
            {waste.slice(0, 10).map((w: any) => (
              <Card key={w.id} className="bg-slate-800/50 border-slate-700/50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white">{w.menuItemName}</h3>
                    <p className="text-sm text-slate-400">{w.qty} units - {w.reason}</p>
                  </div>
                  <span className="text-slate-400 text-sm">{formatPrice(w.totalCost)}</span>
                </div>
              </Card>
            ))}
            {waste.length === 0 && <div className="p-8 text-center text-slate-500">No waste recorded</div>}
          </div>
        </motion.div>
      )}

      {/* Tab: Forecasting */}
      {activeTab === 'forecasting' && isManager && (
        <InventoryForecasting />
      )}

      {/* Modal: Supplier */}
      <Modal isOpen={showSupplierModal} onClose={() => setShowSupplierModal(false)} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
        <div className="space-y-3">
          <input placeholder="Name" value={supplierForm.name ?? ''} onChange={(e) => setSupplierForm(v => ({ ...v, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
          <input placeholder="Email" value={supplierForm.email ?? ''} onChange={(e) => setSupplierForm(v => ({ ...v, email: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
          <input placeholder="Phone" value={supplierForm.phone ?? ''} onChange={(e) => setSupplierForm(v => ({ ...v, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
          <input placeholder="Address" value={supplierForm.address ?? ''} onChange={(e) => setSupplierForm(v => ({ ...v, address: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
          <div className="flex gap-2 pt-3">
            <Button onClick={handleSaveSupplier} className="flex-1">Save</Button>
            <Button onClick={() => setShowSupplierModal(false)} variant="outline" className="flex-1">Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Purchase Order */}
      <Modal isOpen={showNewPO} onClose={() => setShowNewPO(false)} title="New Purchase Order">
        <div className="space-y-3">
          <select value={newPO.supplierId} onChange={(e) => setNewPO(v => ({ ...v, supplierId: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white">
            <option value="">Select Supplier</option>
            {suppliers.filter(s => s.isActive).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          <input type="date" value={newPO.expectedDelivery} onChange={(e) => setNewPO(v => ({ ...v, expectedDelivery: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" />
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Items</span>
              <Button onClick={() => setNewPOItems(v => [...v, { menuItemId: '', orderedQty: 1, unitCost: 0 }])} size="sm" variant="outline">Add Item</Button>
            </div>
            {newPOItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <select value={item.menuItemId} onChange={(e) => setNewPOItems(v => v.map((i, j) => j === idx ? { ...i, menuItemId: e.target.value } : i))} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm">
                  <option value="">Item</option>
                  {menuItems.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
                <input type="number" placeholder="Qty" value={item.orderedQty} onChange={(e) => setNewPOItems(v => v.map((i, j) => j === idx ? { ...i, orderedQty: parseInt(e.target.value || '0', 10) } : i))} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" min="1" />
                <input type="number" placeholder="Cost" value={item.unitCost} onChange={(e) => setNewPOItems(v => v.map((i, j) => j === idx ? { ...i, unitCost: parseFloat(e.target.value || '0') } : i))} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" min="0" step="0.01" />
              </div>
            ))}
          </div>
          <textarea placeholder="Notes" value={newPO.notes} onChange={(e) => setNewPO(v => ({ ...v, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" rows={2} />
          <div className="flex gap-2 pt-3">
            <Button onClick={handleCreatePO} className="flex-1">Create</Button>
            <Button onClick={() => setShowNewPO(false)} variant="outline" className="flex-1">Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Waste */}
      <Modal isOpen={showWasteModal} onClose={() => setShowWasteModal(false)} title="Record Waste">
        <div className="space-y-3">
          <select value={wasteForm.menuItemId} onChange={(e) => setWasteForm(v => ({ ...v, menuItemId: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white">
            <option value="">Select Item</option>
            {menuItems.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
          </select>
          <input type="number" placeholder="Quantity" value={wasteForm.qty} onChange={(e) => setWasteForm(v => ({ ...v, qty: parseInt(e.target.value || '0', 10) }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" min="1" />
          <select value={wasteForm.reason} onChange={(e) => setWasteForm(v => ({ ...v, reason: e.target.value as WasteReason }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white">
            {WASTE_REASONS.map(r => (<option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>))}
          </select>
          <textarea placeholder="Notes" value={wasteForm.notes} onChange={(e) => setWasteForm(v => ({ ...v, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white" rows={2} />
          <div className="flex gap-2 pt-3">
            <Button onClick={handleRecordWaste} className="flex-1">Record</Button>
            <Button onClick={() => setShowWasteModal(false)} variant="outline" className="flex-1">Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
