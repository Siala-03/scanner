import React, { useMemo, useState } from 'react';
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

const PO_STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
  sent:      { label: 'Sent',      color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  confirmed: { label: 'Confirmed', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  partial:   { label: 'Partial',   color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  received:  { label: 'Received',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  cancelled: { label: 'Cancelled', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
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

// ── Helper Functions ─────────────────────────────────────────────────────────

function normalizeInventoryRecord(rec: any): InventoryRecord {
  const menuItemId = rec.menuItemId || rec.menu_item_id || rec.itemId || rec.item_id || '';
  if (!menuItemId) {
    console.warn('Inventory record has no menuItemId:', rec);
  }
  return {
    menuItemId,
    stock: rec.stock ?? 0,
    lowStockThreshold: rec.lowStockThreshold ?? rec.low_stock_threshold ?? 0,
    reorderPoint: rec.reorderPoint ?? rec.reorder_point ?? 0,
    reorderQty: rec.reorderQty ?? rec.reorder_qty ?? 0,
    unitCost: rec.unitCost ?? rec.unit_cost ?? 0,
    supplierId: rec.supplierId ?? rec.supplier_id,
    location: rec.location ?? '',
    updatedAt: rec.updatedAt ?? rec.updated_at ?? new Date().toISOString(),
  };
}

// ── Main Component ───────────────────────────────────────────────────────────

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
  const menuCategories = useMemo(() => Array.from(new Set(menuItems.map((m) => m.category))), [menuItems]);
  const isManager = role === 'manager';
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const inventoryMap = useMemo(() => {
    const map: Record<string, InventoryRecord> = {};
    inventory.forEach((rec) => {
      const normalized = normalizeInventoryRecord(rec);
      if (normalized.menuItemId) {
        map[normalized.menuItemId] = normalized;
      }
    });
    if (Object.keys(map).length === 0 && inventory.length > 0) {
      console.warn('No valid inventory items found after normalization. Inventory count:', inventory.length);
    }
    return map;
  }, [inventory]);

  const inventoryLocations = useMemo(() => {
    const locs = inventory
      .map((rec) => rec.location || '')
      .filter((l) => l && l.trim().length > 0);
    return ['all', ...Array.from(new Set(locs))];
  }, [inventory]);

  // ── Overview state ──────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'low' | 'out'>('all');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<InventoryRecord>>({});
  const [selectedItemDetails, setSelectedItemDetails] = useState<null | {
    item: any;
    rec?: InventoryRecord;
    stock: number;
    threshold: number;
    isOut: boolean;
    isLow: boolean;
    lastUpdatedDays: number | null;
  }>(null);

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
        const lastUpdatedDays = rec?.updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(rec.updatedAt).getTime()) / (1000 * 60 * 60 * 24))) : null;
        return {
          item,
          rec,
          stock,
          threshold,
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

  // lowStockItems loaded from backend state via fetchLowStockItems() and setLowStockItems()

  const handleSaveRow = async (menuItemId: string, _name: string) => {
    if (!isManager) return;
    const current = inventoryMap[menuItemId];
    if (!current) {
      console.error('Item not found in inventory map', { menuItemId, availableKeys: Object.keys(inventoryMap) });
      alert(`Item not found. Please refresh the page and try again.`);
      return;
    }
    
    const updatePayload: any = {};
    
    // Check each field and add to payload if it changed
    if (editValues.stock !== undefined && editValues.stock !== current.stock) {
      updatePayload.stock = editValues.stock;
    }
    if (editValues.lowStockThreshold !== undefined && editValues.lowStockThreshold !== current.lowStockThreshold) {
      updatePayload.low_stock_threshold = editValues.lowStockThreshold;
    }
    if (editValues.reorderPoint !== undefined && editValues.reorderPoint !== current.reorderPoint) {
      updatePayload.reorder_point = editValues.reorderPoint;
    }
    if (editValues.reorderQty !== undefined && editValues.reorderQty !== current.reorderQty) {
      updatePayload.reorder_qty = editValues.reorderQty;
    }
    if (editValues.unitCost !== undefined && editValues.unitCost !== current.unitCost) {
      updatePayload.unit_cost = editValues.unitCost;
    }
    if (editValues.location !== undefined && editValues.location !== current.location) {
      updatePayload.location = editValues.location;
    }

    if (Object.keys(updatePayload).length === 0) {
      alert('No changes made');
      setEditingRow(null);
      setEditValues({});
      return;
    }

    try {
      console.log('Saving inventory item:', { menuItemId, updatePayload, currentStock: current.stock, newStock: editValues.stock });
      
      // Send all field values, not just changed ones, to ensure consistency
      const updateData = {
        stock: editValues.stock !== undefined ? editValues.stock : current.stock,
        low_stock_threshold: editValues.lowStockThreshold !== undefined ? editValues.lowStockThreshold : current.lowStockThreshold,
        reorder_point: editValues.reorderPoint !== undefined ? editValues.reorderPoint : current.reorderPoint,
        reorder_qty: editValues.reorderQty !== undefined ? editValues.reorderQty : current.reorderQty,
        unit_cost: editValues.unitCost !== undefined ? editValues.unitCost : current.unitCost,
        location: editValues.location !== undefined ? editValues.location : current.location,
      };
      console.log('Sending to backend:', updateData);
      
      const result = await apiUpdateInventoryRecord(menuItemId, updateData);
      console.log('Update response from backend:', result);
      
      // Refresh the data
      console.log('Calling refresh to fetch updated data...');
      await refresh();
      console.log('Refresh complete');
      
      alert('Inventory item updated successfully');
      setEditingRow(null);
      setEditValues({});
    } catch (err) {
      console.error('Failed to update inventory record detailed:', { menuItemId, error: err });
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to update inventory item: ${errorMessage}`);
      // Don't clear edit state on error so user can retry
    }
  };

  const handleDeleteInventoryItem = async (menuItemId: string) => {
    if (!isManager) return;
    try {
      await apiDeleteInventoryRecord(menuItemId);
      await refresh();
      // Show success message
      alert('Inventory item deleted successfully');
    } catch (err) {
      console.error('Failed to delete inventory record', err);
      alert(`Failed to delete inventory item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // ── Purchase Orders state ───────────────────────────────────────────────
  const [poFilter, setPoFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showNewPO, setShowNewPO] = useState(false);
  const [newPO, setNewPO] = useState({ supplierId: '', expectedDelivery: '', notes: '' });
  const [newPOItems, setNewPOItems] = useState<{ menuItemId: string; orderedQty: number; unitCost: number }[]>([]);
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  const handleCreatePO = async () => {
    // Validate required fields
    if (!newPO.supplierId) {
      alert('Please select a supplier');
      return;
    }
    
    if (newPOItems.length === 0) {
      alert('Please add at least one item to the purchase order');
      return;
    }
    
    // Validate all items have required fields
    const invalidItems = newPOItems.filter(i => !i.menuItemId || i.orderedQty <= 0);
    if (invalidItems.length > 0) {
      alert('Please fill in all item details (select item and enter valid quantity)');
      return;
    }
    
    const sup = suppliers.find((s) => s.id === newPO.supplierId);
    if (!sup) {
      alert('Selected supplier not found');
      return;
    }
    
    try {
      console.log('Creating purchase order:', { supplier: sup.name, itemCount: newPOItems.length });
      await apiCreatePurchaseOrder({
        supplierId: sup.id,
        supplierName: sup.name,
        status: 'draft',
        items: newPOItems.map((i) => ({
          menuItemId: i.menuItemId,
          menuItemName: menuItems.find((m) => m.id === i.menuItemId)?.name ?? i.menuItemId,
          orderedQty: i.orderedQty,
          receivedQty: 0,
          unitCost: i.unitCost,
          totalCost: i.orderedQty * i.unitCost,
        })),
        totalCost: newPOItems.reduce((s, i) => s + i.orderedQty * i.unitCost, 0),
        expectedDelivery: newPO.expectedDelivery,
        notes: newPO.notes,
        createdBy: 'Manager',
      });
      
      alert('Purchase order created successfully');
    } catch (err) {
      console.error('Failed to create PO', err);
      alert(`Failed to create purchase order: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return; // Don't close modal on error
    }
    
    setShowNewPO(false);
    setNewPO({ supplierId: '', expectedDelivery: '', notes: '' });
    setNewPOItems([]);
    await refresh();
  };

  const handleReceivePO = async () => {
    if (!receiveModal) return;
    const items = receiveModal.items.map((i) => ({
      menu_item_id: i.menuItemId,
      received_qty: receiveQtys[i.menuItemId] ?? 0,
    }));
    try {
      await apiReceivePurchaseOrder(receiveModal.id, items, 'Manager');
      await refresh();
      alert('Purchase order received successfully');
      setReceiveModal(null);
      setReceiveQtys({});
    } catch (err) {
      console.error('Failed to receive PO', err);
      alert(`Failed to receive purchase order: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setReceiveModal(null);
    setReceiveQtys({});
  };

  // ── Suppliers state ─────────────────────────────────────────────────────
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});

  const handleSaveSupplier = async () => {
    if (!supplierForm.name) return;
    const payload = {
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
      notes: supplierForm.notes ?? '',
    };
    try {
      if (editingSupplier) {
        await apiUpdateSupplier(editingSupplier.id, payload);
      } else {
        await apiCreateSupplier(payload);
      }
      await refresh();
      alert('Supplier saved successfully');
    } catch (err) {
      console.error('Failed to save supplier', err);
      alert(`Failed to save supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setShowSupplierModal(false);
    setEditingSupplier(null);
    setSupplierForm({});
  };

  // ── Waste state ─────────────────────────────────────────────────────────
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({ menuItemId: '', qty: 1, reason: 'expired' as WasteReason, notes: '' });
  const [wasteQuery, setWasteQuery] = useState('');

  const handleRecordWaste = async () => {
    if (!wasteForm.menuItemId || wasteForm.qty <= 0) return;
    const mi = menuItems.find((m) => m.id === wasteForm.menuItemId);
    if (!mi) return;
    try {
      await apiRecordWaste({
        menu_item_id: wasteForm.menuItemId,
        menu_item_name: mi.name,
        qty: wasteForm.qty,
        unit_cost: inventoryMap[wasteForm.menuItemId]?.unitCost ?? 0,
        reason: wasteForm.reason,
        reported_by: 'Manager',
        recorded_by: 'Manager',
        notes: wasteForm.notes || undefined,
      });
      await refresh();
      alert('Waste recorded successfully');
    } catch (err) {
      console.error('Failed to record waste', err);
      alert(`Failed to record waste: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setShowWasteModal(false);
    setWasteForm({ menuItemId: '', qty: 1, reason: 'expired', notes: '' });
  };

  // ── Tab definitions ─────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Stock', icon: <PackageIcon className="w-4 h-4" />, badge: lowStockItems.length || undefined },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: <TruckIcon className="w-4 h-4" />, badge: purchaseOrders.filter((po) => po.status !== 'received' && po.status !== 'cancelled').length || undefined },
    { id: 'suppliers', label: 'Suppliers', icon: <TruckIcon className="w-4 h-4" /> },
    { id: 'waste', label: 'Waste', icon: <TrashIcon className="w-4 h-4" /> },
    { id: 'forecasting', label: 'Forecasting', icon: <TrendingUpIcon className="w-4 h-4" />, badge: forecastAlerts.length || undefined },
    { id: 'locations', label: 'Locations', icon: <MapPinIcon className="w-4 h-4" />, badge: locations.filter((l) => l.lowStockItems > 0).length || undefined },
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
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => {
                    if (suppliers.length === 0) {
                      alert('Please add at least one supplier before creating a purchase order.');
                      setActiveTab('suppliers');
                      return;
                    }
                    setNewPO({ supplierId: suppliers[0].id, expectedDelivery: '', notes: '' });
                    setNewPOItems([]);
                    setShowNewPO(true);
                  }}
                >
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
        {isLoading && (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100">
            Loading inventory data from server. Please wait...
          </div>
        )}
        {!isLoading && loadError && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-red-100 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Unable to load inventory data.</p>
              <p className="text-xs text-red-200">{loadError}</p>
            </div>
            <Button variant="primary" size="sm" onClick={refresh}>Retry</Button>
          </div>
        )}

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
                {lowStockItems.slice(0, 6).map((x) => {
                  const menuItem = menuItems.find((m) => m.id === x.menuItemId);
                  return (
                    <span key={x.menuItemId} className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-200 text-xs">
                      {menuItem?.name ?? x.menuItemId} ({x.stock} left)
                    </span>
                  );
                })}
                {lowStockItems.length > 6 && (
                  <span className="text-red-300/70 text-xs self-center">+{lowStockItems.length - 6} more</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {inventoryAlerts.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Inventory Alerts</p>
            <ul className="mt-1 list-disc list-inside text-xs text-amber-900">
              {inventoryAlerts.map((msg, index) => (
                <li key={`${msg}-${index}`}>{msg}</li>
              ))}
            </ul>
          </div>
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
                { label: 'Total Stock Value', value: formatPrice(analytics.totalStockValue), icon: <TrendingUpIcon className="w-5 h-5 text-emerald-400" />, color: 'text-emerald-400' },
                { label: 'Low Stock', value: analytics.lowStockCount, icon: <AlertTriangleIcon className="w-5 h-5 text-amber-400" />, color: 'text-amber-400' },
                { label: 'Out of Stock', value: analytics.outOfStockCount, icon: <XCircleIcon className="w-5 h-5 text-red-400" />, color: 'text-red-400' },
                { label: 'Below Reorder', value: analytics.belowReorderCount, icon: <TruckIcon className="w-5 h-5 text-indigo-400" />, color: 'text-indigo-400' },
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
                {menuCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {inventoryLocations.map((loc) => <option key={loc} value={loc}>{loc === 'all' ? 'All Locations' : loc}</option>)}
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Threshold</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reorder Point</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reorder Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Unit Cost</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock Value</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Age</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                      {isManager && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {inventoryRows.map((row) => {
                      const isEditing = editingRow === row.item.id;
                      const maxStock = Math.max(row.rec?.reorderQty ?? row.stock * 2 ?? 20, row.stock, 1);
                      return (
                        <tr
                          key={row.item.id}
                          className={`transition-colors ${row.isOut ? 'bg-red-500/5' : row.isLow ? 'bg-amber-500/5' : 'hover:bg-slate-700/20'}`}
                        >
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedItemDetails(row)}
                              className="text-left w-full"
                              title="View item movement details"
                            >
                              <div>
                                <p className="text-white font-medium text-sm hover:text-amber-300 underline underline-offset-2">{row.item.name}</p>
                                <p className="text-xs text-slate-500">{row.item.id} · {row.item.category.replace(/-/g, ' ')}</p>
                              </div>
                            </button>
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
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValues.lowStockThreshold ?? row.rec?.lowStockThreshold ?? 0}
                                onChange={(e) => setEditValues((v) => ({ ...v, lowStockThreshold: parseInt(e.target.value || '0', 10) }))}
                                className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                min={0}
                              />
                            ) : (
                              <span className="text-xs text-slate-300">{row.rec?.lowStockThreshold ?? 0}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValues.reorderPoint ?? row.rec?.reorderPoint ?? 0}
                                onChange={(e) => setEditValues((v) => ({ ...v, reorderPoint: parseInt(e.target.value || '0', 10) }))}
                                className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                min={0}
                              />
                            ) : (
                              <span className="text-xs text-slate-300">{row.rec?.reorderPoint ?? 0}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValues.reorderQty ?? row.rec?.reorderQty ?? 0}
                                onChange={(e) => setEditValues((v) => ({ ...v, reorderQty: parseInt(e.target.value || '0', 10) }))}
                                className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                min={0}
                              />
                            ) : (
                              <span className="text-xs text-slate-300">{row.rec?.reorderQty ?? 0}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValues.unitCost ?? row.rec?.unitCost ?? 0}
                                onChange={(e) => setEditValues((v) => ({ ...v, unitCost: parseFloat(e.target.value || '0') }))}
                                step="0.01"
                                className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                min={0}
                              />
                            ) : (
                              <span className="text-sm text-slate-300">{formatPrice(row.rec?.unitCost ?? 0)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{formatPrice((row.rec?.unitCost ?? 0) * row.stock)}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {row.lastUpdatedDays !== null ? `${row.lastUpdatedDays}d` : '—'}
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
                                      const rec = inventoryMap[row.item.id];
                                      setEditingRow(row.item.id);
                                      setEditValues({
                                        stock: rec?.stock ?? 0,
                                        lowStockThreshold: rec?.lowStockThreshold ?? 0,
                                        reorderPoint: rec?.reorderPoint ?? 0,
                                        reorderQty: rec?.reorderQty ?? 0,
                                        unitCost: rec?.unitCost ?? 0,
                                        location: rec?.location ?? '',
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-amber-400 hover:bg-slate-600 transition"
                                    title="Edit"
                                  >
                                    <EditIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setNewPO({ supplierId: suppliers[0]?.id ?? '', expectedDelivery: '', notes: `Auto reordering ${row.item.name} based on threshold` });
                                      setNewPOItems([{ menuItemId: row.item.id, orderedQty: Math.max((row.rec?.reorderQty ?? 5) - row.stock, 1), unitCost: row.rec?.unitCost ?? 0 }]);
                                      setShowNewPO(true);
                                    }}
                                    className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition"
                                    title="Smart Reorder"
                                  >
                                    <PlusIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Delete inventory record for ${row.item.name}? This action cannot be undone.`)) {
                                        handleDeleteInventoryItem(row.item.id);
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition"
                                    title="Delete"
                                  >
                                    <TrashIcon className="w-4 h-4" />
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

        {selectedItemDetails && (
            <Modal isOpen={!!selectedItemDetails} onClose={() => setSelectedItemDetails(null)}>
              <div className="p-4 space-y-4 max-w-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedItemDetails.item.name} Movement History</h3>
                    <p className="text-xs text-slate-400">{selectedItemDetails.item.id}</p>
                  </div>
                  <button onClick={() => setSelectedItemDetails(null)} className="text-slate-400 hover:text-white">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                  <div><span className="font-semibold">Stock</span>: {selectedItemDetails.stock}</div>
                  <div><span className="font-semibold">Status</span>: {selectedItemDetails.isOut ? 'Out' : selectedItemDetails.isLow ? 'Low' : 'Healthy'}</div>
                  <div><span className="font-semibold">Reorder</span>: {selectedItemDetails.rec?.reorderQty ?? '-'}</div>
                  <div><span className="font-semibold">Last Updated</span>: {selectedItemDetails.lastUpdatedDays !== null ? `${selectedItemDetails.lastUpdatedDays}d ago` : '-'}</div>
                </div>

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Recent Movement</h4>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {movements
                      .filter((m) => m.menuItemId === selectedItemDetails.item.id)
                      .slice(0, 8)
                      .map((m) => (
                        <div key={m.id} className="flex items-center justify-between bg-slate-850/70 p-2 rounded-lg text-xs">
                          <div>
                            <p className="text-slate-200">{m.type.toUpperCase()} {m.qty > 0 ? `+${m.qty}` : m.qty}</p>
                            <p className="text-slate-400">{new Date(m.timestamp).toLocaleString()}</p>
                          </div>
                          <span className="text-slate-300">{m.reference ?? m.performedBy}</span>
                        </div>
                      ))}
                    {movements.filter((m) => m.menuItemId === selectedItemDetails.item.id).length === 0 && (
                      <p className="text-slate-400 text-xs">No movements recorded yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </Modal>
          )}

        {activeTab === 'locations' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
              {locations.map((loc) => (
                <Card key={loc.id} className="bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{loc.name}</h3>
                      <p className="text-xs text-slate-400">{loc.type.replace(/_/g, ' ')}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${loc.isActive ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
                      {loc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <div><span className="font-medium">Items</span>: {loc.totalItems}</div>
                    <div><span className="font-medium">Stock</span>: {loc.totalStock}</div>
                    <div><span className="font-medium">Low</span>: {loc.lowStockItems}</div>
                    <div><span className="font-medium">Capacity</span>: {loc.capacity ?? '—'}</div>
                    <div className="col-span-2"><span className="font-medium">Temp</span>: {loc.temperatureRange ?? 'N/A'}</div>
                  </div>
                </Card>
              ))}
              {locations.length === 0 && (
                <div className="py-16 text-center text-slate-500">No locations found.</div>
              )}
            </div>

            <Card className="bg-slate-800/50 border border-slate-700/50" padding="none">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/40 border-b border-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Items</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Capacity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Temp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {locations.map((loc) => (
                      <tr key={loc.id} className="hover:bg-slate-700/20">
                        <td className="px-4 py-3 text-sm text-white">{loc.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{loc.type.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{loc.totalItems}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{loc.totalStock}</td>
                        <td className="px-4 py-3 text-sm text-amber-300">{loc.lowStockItems}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{loc.capacity ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{loc.temperatureRange ?? 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                { label: 'Total POs', value: purchaseOrders.length, color: 'text-white' },
                { label: 'Pending', value: analytics.pendingPOCount, color: 'text-amber-400' },
                { label: 'Pending Value', value: formatPrice(analytics.pendingPOValue), color: 'text-amber-400' },
                { label: 'Received This Month', value: purchaseOrders.filter((p) => p.status === 'received').length, color: 'text-emerald-400' },
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
                            onClick={async (e) => { e.stopPropagation(); try { await apiUpdatePurchaseOrder(po.id, { status: 'sent' }); await refresh(); alert('Purchase order sent successfully'); } catch (err) { console.error('Failed to send PO', err); alert(`Failed to send PO: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
                            className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition"
                          >
                            Send PO
                          </button>
                          <button
                            onClick={async (e) => { e.stopPropagation(); try { await apiUpdatePurchaseOrder(po.id, { status: 'cancelled' }); await refresh(); alert('Purchase order cancelled successfully'); } catch (err) { console.error('Failed to cancel PO', err); alert(`Failed to cancel PO: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
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
                        onClick={async () => { try { await apiUpdateSupplier(sup.id, { isActive: !sup.isActive }); await refresh(); alert(`Supplier ${sup.isActive ? 'deactivated' : 'activated'} successfully`); } catch (err) { console.error('Failed to update supplier', err); alert(`Failed to update supplier: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
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
                    {waste.map((w) => (
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
                {waste.length === 0 && (
                  <div className="py-12 text-center text-slate-500">No waste entries found.</div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: FORECASTING
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'forecasting' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <InventoryForecasting
              forecasts={forecasts}
              alerts={forecastAlerts}
              onGenerateForecasts={async () => { await runForecasting(); }}
              isGenerating={isGeneratingForecasts}
            />
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
          {suppliers.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
                <p className="text-slate-300 mb-3">No suppliers available</p>
                <p className="text-xs text-slate-400 mb-4">Create at least one supplier before generating purchase orders.</p>
                <button
                  onClick={() => {
                    setShowNewPO(false);
                    setActiveTab('suppliers');
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition"
                >
                  Go to Suppliers
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newPO.supplierId}
                  onChange={(e) => setNewPO((v) => ({ ...v, supplierId: e.target.value }))}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                <option value="">Select Supplier</option>
                {suppliers.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {suppliers.filter((s) => !s.isActive).length > 0 && (
                  <optgroup label="Inactive">
                    {suppliers.filter((s) => !s.isActive).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} (Inactive)</option>
                    ))}
                  </optgroup>
                )}
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
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, unitCost: parseFloat(e.target.value || '0') } : i))}
                    step="0.01"
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
                  disabled={!newPO.supplierId || newPOItems.length === 0 || newPOItems.some(i => !i.menuItemId || i.orderedQty <= 0)}
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!newPO.supplierId ? 'Select a supplier' : newPOItems.length === 0 ? 'Add items to the order' : 'Fill in all item details'}
                >
                  Create PO
                </button>
              </div>
            </div>
          )}
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
                  <label key={c} className="flex items-center gap-1 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={(supplierForm.categories ?? []).includes(c)}
                      onChange={(e) => {
                        const cats = supplierForm.categories ?? [];
                        const newCats = e.target.checked ? [...cats, c] : cats.filter((x) => x !== c);
                        setSupplierForm((v) => ({ ...v, categories: newCats }));
                      }}
                      className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                    />
                    {c}
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
