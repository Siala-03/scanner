import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  UploadIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LinkIcon,
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
import { createMenuItem } from '../../api/menu';
import {
  updateInventoryRecord as apiUpdateInventoryRecord,
  deleteInventoryRecord as apiDeleteInventoryRecord,
  relinkInventoryRecord as apiRelinkInventoryRecord,
  createSupplier as apiCreateSupplier,
  updateSupplier as apiUpdateSupplier,
  createLocation as apiCreateLocation,
  updateLocation as apiUpdateLocation,
  deleteLocation as apiDeleteLocation,
  createPurchaseOrder as apiCreatePurchaseOrder,
  updatePurchaseOrder as apiUpdatePurchaseOrder,
  receivePurchaseOrder as apiReceivePurchaseOrder,
  recordWaste as apiRecordWaste,
} from '../../api/inventory';
import {
  provisionSupplierPortalAccess,
  type SupplierPortalAccessProvisionResult,
} from '../../api/supplier';
import {
  exportInventoryToCsv,
  downloadInventoryTemplate,
  importInventoryFromFile,
} from '../../utils/inventoryImportExport';

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
const ALERT_HIDDEN_MS = 30 * 60 * 1000;
const ALERT_VISIBLE_MS = 30 * 1000;

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
  const menuItemId = rec.menuItemId || rec.menu_item_id || rec.itemId || rec.item_id || rec.id || '';
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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as any).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown error';
}

function generatePortalPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function parseCostChangeNote(note?: string): { oldCost: number; newCost: number } | null {
  if (!note || !note.includes('COST_CHANGE|')) return null;
  const oldMatch = note.match(/old=([^|]+)/);
  const newMatch = note.match(/new=([^|]+)/);
  const oldCost = oldMatch ? Number(oldMatch[1]) : Number.NaN;
  const newCost = newMatch ? Number(newMatch[1]) : Number.NaN;
  if (Number.isNaN(oldCost) || Number.isNaN(newCost)) return null;
  return { oldCost, newCost };
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
    forecasts,
    forecastAlerts,
    isGeneratingForecasts,
    runForecasting,
    isLoading,
    refresh,
    upsertInventoryRecords,
    removeInventoryRecord,
    locations,
  } = useInventoryData();
  const menuCategories = useMemo(() => Array.from(new Set(menuItems.map((m) => m.category))), [menuItems]);
  const isManager = role === 'manager';

  // Calculate pendingPO stats from loaded purchase orders
  const pendingPOCount = useMemo(() => purchaseOrders.filter(po => !['received', 'cancelled'].includes(po.status)).length, [purchaseOrders]);
  const pendingPOValue = useMemo(() => purchaseOrders.filter(po => !['received', 'cancelled'].includes(po.status)).reduce((sum, po) => sum + (po.totalCost || 0), 0), [purchaseOrders]);
  const pastPOValue = useMemo(
    () => purchaseOrders
      .filter((po) => po.status === 'received')
      .reduce((sum, po) => sum + (po.totalCost || 0), 0),
    [purchaseOrders]
  );

  // Combined item list for PO creation: menu items + standalone inventory items
  const allInventoryItems = useMemo(() => {
    const menuItemSet = new Set(menuItems.map(m => m.id));
    const nonMenuItems = inventory
      .map(rec => normalizeInventoryRecord(rec))
      .filter(rec => !menuItemSet.has(rec.menuItemId))
      .map(rec => ({ id: rec.menuItemId, name: rec.menuItemId, isMenuItem: false }));
    return [
      ...menuItems.map(m => ({ id: m.id, name: m.name, isMenuItem: true })),
      ...nonMenuItems,
    ];
  }, [menuItems, inventory]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isImportingInventory, setIsImportingInventory] = useState(false);
  const [isExportInventoryOpen, setIsExportInventoryOpen] = useState(false);
  const inventoryFileInputRef = useRef<HTMLInputElement>(null);
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
  const [addItemMode, setAddItemMode] = useState<'menu' | 'standalone'>('menu');
  const [addMenuSearch, setAddMenuSearch] = useState('');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<typeof locations[number] | null>(null);
  const [showEditLocationModal, setShowEditLocationModal] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: '',
    type: 'kitchen' as 'warehouse' | 'walk_in' | 'dry_store' | 'bar' | 'kitchen' | 'cold_room' | 'freezer' | 'display' | 'other',
    description: '',
    capacity: '',
    temperatureRange: '',
  });
  const [newInventoryItemName, setNewInventoryItemName] = useState('');
  const [newInventoryItemLocation, setNewInventoryItemLocation] = useState('');
  const [newInventoryItemStock, setNewInventoryItemStock] = useState(0);
  const [newInventoryItemLowThreshold, setNewInventoryItemLowThreshold] = useState(5);
  const [newInventoryItemReorderPoint, setNewInventoryItemReorderPoint] = useState(10);
  const [newInventoryItemReorderQty, setNewInventoryItemReorderQty] = useState(20);
  const [newInventoryItemUnitCost, setNewInventoryItemUnitCost] = useState(0);
  const [newInventoryItemUnitMeasurement, setNewInventoryItemUnitMeasurement] = useState('units');

  // ── Add to Menu modal state ─────────────────────────────────────────────
  const [showAddToMenuModal, setShowAddToMenuModal] = useState(false);
  const [addToMenuItemId, setAddToMenuItemId] = useState(''); // existing inventory record's menuItemId
  const [addToMenuName, setAddToMenuName] = useState('');
  const [addToMenuPrice, setAddToMenuPrice] = useState(0);
  const [addToMenuCategory, setAddToMenuCategory] = useState('');
  const [isAddingToMenu, setIsAddingToMenu] = useState(false);

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

  const menuItemMap = useMemo(
    () => Object.fromEntries(menuItems.map((item) => [item.id, item])),
    [menuItems]
  );

  const inventoryLocations = useMemo(() => {
    const locs = inventory
      .map((rec) => rec.location || '')
      .filter((l) => l && l.trim().length > 0);
    return ['all', ...Array.from(new Set(locs))];
  }, [inventory]);

  const inventoryCategories = useMemo(
    () => ['all', ...Array.from(new Set([...menuCategories, 'Other']))],
    [menuCategories]
  );

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

    const inventoryByMenuItemId = inventory.reduce((map: Record<string, InventoryRecord>, rec) => {
      const normalized = normalizeInventoryRecord(rec);
      if (normalized.menuItemId) {
        map[normalized.menuItemId] = normalized;
      }
      return map;
    }, {});

    const menuRows = menuItems.map((item) => {
      const rec = inventoryByMenuItemId[item.id];
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
    });

    const otherRows = inventory
      .map(normalizeInventoryRecord)
      .filter((rec) => !menuItemMap[rec.menuItemId])
      .map((rec) => {
        const item = {
          id: rec.menuItemId,
          name: rec.menuItemId,
          category: 'Other',
        };
        const stock = rec.stock;
        const threshold = rec.lowStockThreshold;
        const lastUpdatedDays = rec.updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(rec.updatedAt).getTime()) / (1000 * 60 * 60 * 24))) : null;
        return {
          item,
          rec,
          stock,
          threshold,
          isOut: stock === 0,
          isLow: stock > 0 && stock <= threshold,
          lastUpdatedDays,
        };
      });

    return [...menuRows, ...otherRows]
      .filter((row) => {
        if (q) {
          const match =
            row.item.name.toLowerCase().includes(q) ||
            row.item.id.toLowerCase().includes(q) ||
            row.item.category.toLowerCase().includes(q) ||
            (row.rec?.location || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        if (categoryFilter !== 'all' && row.item.category !== categoryFilter) {
          return false;
        }
        if (locationFilter !== 'all' && (row.rec?.location || '').toLowerCase() !== locationFilter.toLowerCase()) {
          return false;
        }
        if (statusFilter === 'ok') return !row.isLow && !row.isOut;
        if (statusFilter === 'low') return row.isLow;
        if (statusFilter === 'out') return row.isOut;
        return true;
      })
      .sort((a, b) => {
        if (a.isOut !== b.isOut) return Number(b.isOut) - Number(a.isOut);
        if (a.isLow !== b.isLow) return Number(b.isLow) - Number(a.isLow);
        return a.item.name.localeCompare(b.item.name);
      });
  }, [query, categoryFilter, locationFilter, statusFilter, inventory, menuItems, menuItemMap]);

  // lowStockItems loaded from backend state via fetchLowStockItems() and setLowStockItems()

  const handleCreateOtherInventoryItem = async () => {
    // In menu mode use the real menu item ID; in standalone mode use the name as ID
    const menuItemId =
      addItemMode === 'menu' ? selectedMenuItemId : newInventoryItemName.trim();

    if (!menuItemId) {
      alert(
        addItemMode === 'menu'
          ? 'Please select a menu item'
          : 'Please enter an item name'
      );
      return;
    }

    try {
      const created = await apiUpdateInventoryRecord(menuItemId, {
        stock: newInventoryItemStock,
        lowStockThreshold: newInventoryItemLowThreshold,
        reorderPoint: newInventoryItemReorderPoint,
        reorderQty: newInventoryItemReorderQty,
        unitCost: newInventoryItemUnitCost,
        unitMeasurement: newInventoryItemUnitMeasurement,
        location: newInventoryItemLocation,
      });

      upsertInventoryRecords([created]);
      await refresh();
      setShowAddInventoryModal(false);
      alert('Inventory item added successfully');
    } catch (err) {
      console.error('Failed to add inventory item:', err);
      alert(`Failed to add inventory item: ${getErrorMessage(err)}`);
    }
  };

  const handleSaveRow = async (menuItemId: string, _name: string) => {
    if (!isManager) return;
    const existingRecord = inventoryMap[menuItemId];
    const current: InventoryRecord = existingRecord ?? {
      menuItemId,
      stock: 0,
      lowStockThreshold: 5,
      reorderPoint: 0,
      reorderQty: 0,
      unitCost: 0,
      supplierId: undefined,
      location: '',
      updatedAt: new Date().toISOString(),
    };

    if (!existingRecord) {
      console.warn('Item missing in inventory map, creating new record on save', {
        menuItemId,
        menuItemsCount: menuItems.length,
        inventoryCount: inventory.length,
      });
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
      console.log('Saving inventory item:', { menuItemId, updatePayload });
      await apiUpdateInventoryRecord(menuItemId, updatePayload);
      
      // Refresh the data
      await refresh();
      
      alert('Inventory item updated successfully');
      setEditingRow(null);
      setEditValues({});
    } catch (err) {
      console.error('Failed to update inventory record:', err);
      const errorMessage = getErrorMessage(err);
      alert(`Failed to update inventory item: ${errorMessage}`);
      // Don't clear edit state on error so user can retry
    }
  };

  const handleDeleteInventoryItem = async (menuItemId: string) => {
    if (!isManager) return;
    try {
      await apiDeleteInventoryRecord(menuItemId);
      // Remove immediately from local state so the card disappears without waiting for a full refresh
      removeInventoryRecord(menuItemId);
      // Then sync with the server in the background
      refresh();
      alert('Inventory item deleted successfully');
    } catch (err) {
      console.error('Failed to delete inventory record', err);
      alert(`Failed to delete inventory item: ${getErrorMessage(err)}`);
    }
  };

  const closeAddToMenuModal = () => {
    setShowAddToMenuModal(false);
    setAddToMenuItemId('');
    setAddToMenuName('');
    setAddToMenuPrice(0);
    setAddToMenuCategory('');
  };

  const handleAddToMenu = async () => {
    if (!addToMenuItemId) { alert('Inventory item is missing'); return; }
    if (!addToMenuName.trim()) { alert('Please enter a menu item name'); return; }
    if (addToMenuPrice <= 0) { alert('Please enter a valid price'); return; }
    if (!addToMenuCategory.trim()) { alert('Please select a category'); return; }
    setIsAddingToMenu(true);
    try {
      const newItem = await createMenuItem({
        name: addToMenuName.trim(),
        price: addToMenuPrice,
        category: addToMenuCategory,
        is_available: true,
      });
      await apiRelinkInventoryRecord(addToMenuItemId, newItem.id);
      await refresh();
      closeAddToMenuModal();
      alert(`"${newItem.name}" added to menu and linked to inventory.`);
    } catch (err) {
      console.error('Failed to add to menu', err);
      alert(`Failed to add to menu: ${getErrorMessage(err)}`);
    } finally {
      setIsAddingToMenu(false);
    }
  };

  // ── Purchase Orders state ───────────────────────────────────────────────
  const [poFilter, setPoFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showNewPO, setShowNewPO] = useState(false);
  const [newPO, setNewPO] = useState({ supplierId: '', expectedDelivery: '', notes: '' });
  const [newPOItems, setNewPOItems] = useState<{ menuItemId: string; orderedQty: number; unit: string; unitCost: number }[]>([]);
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  const filteredPurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => poFilter === 'all' || po.status === poFilter),
    [purchaseOrders, poFilter]
  );

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

  const handleCreateLocation = async () => {
    const name = newLocation.name.trim();
    if (!name) {
      alert('Please enter a location name');
      return;
    }

    try {
      await apiCreateLocation({
        name,
        type: newLocation.type,
        description: newLocation.description.trim() || undefined,
        capacity: newLocation.capacity ? Number(newLocation.capacity) : undefined,
        temperatureRange: newLocation.temperatureRange.trim() || undefined,
      });
      await refresh();
      setShowLocationModal(false);
      setNewLocation({
        name: '',
        type: 'kitchen',
        description: '',
        capacity: '',
        temperatureRange: '',
      });
      alert('Location created successfully');
    } catch (err) {
      console.error('Failed to create location', err);
      alert(`Failed to create location: ${getErrorMessage(err)}`);
    }
  };

  const handleUpdateLocation = async () => {
    if (!editingLocation) return;
    const name = editingLocation.name.trim();
    if (!name) { alert('Location name is required'); return; }
    try {
      await apiUpdateLocation(editingLocation.id, {
        name,
        type: editingLocation.type,
        description: editingLocation.description,
        capacity: editingLocation.capacity,
        temperatureRange: editingLocation.temperatureRange,
        isActive: editingLocation.isActive,
      });
      await refresh();
      setShowEditLocationModal(false);
      setEditingLocation(null);
    } catch (err) {
      console.error('Failed to update location', err);
      alert(`Failed to update location: ${getErrorMessage(err)}`);
    }
  };

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!window.confirm(`Delete location "${name}"? This cannot be undone.`)) return;
    try {
      await apiDeleteLocation(id);
      await refresh();
    } catch (err) {
      console.error('Failed to delete location', err);
      alert(`Failed to delete location: ${getErrorMessage(err)}`);
    }
  };

  // ── Suppliers state ─────────────────────────────────────────────────────
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});
  const [enablePortalAccess, setEnablePortalAccess] = useState(false);
  const [portalEmail, setPortalEmail] = useState('');
  const [portalName, setPortalName] = useState('');
  const [portalPhone, setPortalPhone] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [provisioningPortal, setProvisioningPortal] = useState(false);
  const [provisionedAccess, setProvisionedAccess] = useState<SupplierPortalAccessProvisionResult | null>(null);
  const [showInventoryAlerts, setShowInventoryAlerts] = useState(false);

  useEffect(() => {
    if (lowStockItems.length === 0) {
      setShowInventoryAlerts(false);
      return;
    }

    let cycleTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const startHiddenPhase = () => {
      if (disposed) return;
      setShowInventoryAlerts(false);
      cycleTimer = setTimeout(() => {
        if (disposed) return;
        setShowInventoryAlerts(true);
        cycleTimer = setTimeout(startHiddenPhase, ALERT_VISIBLE_MS);
      }, ALERT_HIDDEN_MS);
    };

    // Start by showing the alert immediately, then alternate phases.
    setShowInventoryAlerts(true);
    cycleTimer = setTimeout(startHiddenPhase, ALERT_VISIBLE_MS);

    return () => {
      disposed = true;
      if (cycleTimer) clearTimeout(cycleTimer);
    };
  }, [lowStockItems]);

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
      let savedSupplier: Supplier;
      if (editingSupplier) {
        savedSupplier = await apiUpdateSupplier(editingSupplier.id, payload);
      } else {
        savedSupplier = await apiCreateSupplier(payload);
      }

      if (enablePortalAccess) {
        const email = portalEmail.trim();
        const name = portalName.trim() || savedSupplier.contactPerson || savedSupplier.name;
        const password = portalPassword.trim() || generatePortalPassword();

        if (!email) {
          throw new Error('Supplier portal email is required when portal access is enabled.');
        }
        if (!name) {
          throw new Error('Supplier portal name is required when portal access is enabled.');
        }

        setProvisioningPortal(true);
        try {
          const access = await provisionSupplierPortalAccess({
            supplierId: savedSupplier.id,
            email,
            name,
            phone: portalPhone.trim() || undefined,
            password,
          });
          setProvisionedAccess(access);
        } finally {
          setProvisioningPortal(false);
        }
      }

      await refresh();
      alert('Supplier saved successfully');
    } catch (err) {
      console.error('Failed to save supplier', err);
      alert(`Failed to save supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setProvisioningPortal(false);
      return;
    }
    setShowSupplierModal(false);
    setEditingSupplier(null);
    setSupplierForm({});
    setEnablePortalAccess(false);
    setPortalEmail('');
    setPortalName('');
    setPortalPhone('');
    setPortalPassword('');
  };

  // ── Waste state ─────────────────────────────────────────────────────────
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({ menuItemId: '', qty: 1, reason: 'expired' as WasteReason, notes: '' });
  const [wasteQuery, setWasteQuery] = useState('');

  const handleRecordWaste = async () => {
    if (!wasteForm.menuItemId || wasteForm.qty <= 0) return;
    const mi = menuItems.find((m) => m.id === wasteForm.menuItemId);
    const itemName = mi?.name ?? wasteForm.menuItemId;
    try {
      await apiRecordWaste({
        menu_item_id: wasteForm.menuItemId,
        menu_item_name: itemName,
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
  React.useEffect(() => {
    if (!isExportInventoryOpen) return;
    const close = () => setIsExportInventoryOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [isExportInventoryOpen]);

  // Menu items that have no inventory record yet
  const untrackedMenuItems = useMemo(
    () => menuItems.filter((m) => !inventoryMap[m.id]),
    [menuItems, inventoryMap]
  );

  const filteredUntrackedItems = useMemo(() => {
    const q = addMenuSearch.trim().toLowerCase();
    if (!q) return untrackedMenuItems;
    return untrackedMenuItems.filter(
      (m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
    );
  }, [untrackedMenuItems, addMenuSearch]);

  // Reset add-item modal state when it opens
  React.useEffect(() => {
    if (showAddInventoryModal) {
      setAddItemMode('menu');
      setAddMenuSearch('');
      setSelectedMenuItemId('');
      setNewInventoryItemName('');
      setNewInventoryItemStock(0);
      setNewInventoryItemLowThreshold(5);
      setNewInventoryItemReorderPoint(10);
      setNewInventoryItemReorderQty(20);
      setNewInventoryItemUnitCost(0);
      setNewInventoryItemUnitMeasurement('units');
      setNewInventoryItemLocation('');
    }
  }, [showAddInventoryModal]);

  const handleInventoryExportCsv = () => {
    exportInventoryToCsv(inventoryRows);
    setIsExportInventoryOpen(false);
  };

  const handleInventoryImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingInventory(true);
    try {
      const rows = await importInventoryFromFile(file);
      if (rows.length === 0) throw new Error('No valid rows found in file');
      let updated = 0;
      for (const row of rows) {
        await apiUpdateInventoryRecord(row.menuItemId, {
          stock:             row.stock,
          lowStockThreshold: row.lowStockThreshold,
          reorderPoint:      row.reorderPoint,
          reorderQty:        row.reorderQty,
          unitCost:          row.unitCost,
          cost:              row.unitCost,
          price:             row.price,
          location:          row.location,
          unitMeasurement:   row.unitMeasurement,
          description:       row.description,
          expiryDate:        row.expiryDate,
          purchaseDate:      row.purchaseDate,
          qtyStart:          row.qtyStart,
        });
        updated++;
      }
      await refresh();
      alert(`Successfully imported ${updated} inventory record${updated !== 1 ? 's' : ''}.`);
    } catch (err) {
      alert(`Import failed: ${getErrorMessage(err)}`);
    } finally {
      setIsImportingInventory(false);
      if (inventoryFileInputRef.current) inventoryFileInputRef.current.value = '';
    }
  };

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
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
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
              {isManager && activeTab === 'overview' && (
                <>
                  {/* Template */}
                  <Button variant="ghost" size="sm" onClick={downloadInventoryTemplate}>
                    <FileSpreadsheetIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Template</span>
                  </Button>
                  {/* Import */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => inventoryFileInputRef.current?.click()}
                    isLoading={isImportingInventory}
                  >
                    <UploadIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Import</span>
                  </Button>
                  <input
                    ref={inventoryFileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json"
                    className="hidden"
                    onChange={handleInventoryImportFile}
                  />
                  {/* Export */}
                  <div className="relative">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsExportInventoryOpen((v) => !v)}
                    >
                      <DownloadIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                    {isExportInventoryOpen && (
                      <div className="absolute right-0 mt-2 w-44 bg-slate-800 rounded-md shadow-lg border border-slate-700 z-50">
                        <button
                          onClick={handleInventoryExportCsv}
                          className="w-full px-4 py-2 text-left text-gray-200 hover:bg-slate-700 flex items-center gap-2 text-sm"
                        >
                          <FileSpreadsheetIcon className="w-4 h-4" />
                          Export as CSV
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Add Item */}
                  <Button variant="primary" size="sm" onClick={() => setShowAddInventoryModal(true)}>
                    <PlusIcon className="w-4 h-4" />
                    Add Item
                  </Button>
                </>
              )}
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
                <Button variant="primary" size="sm" onClick={() => { setEditingSupplier(null); setSupplierForm({}); setEnablePortalAccess(false); setPortalEmail(''); setPortalName(''); setPortalPhone(''); setPortalPassword(generatePortalPassword()); setShowSupplierModal(true); }}>
                  <PlusIcon className="w-4 h-4" />
                  Add Supplier
                </Button>
              )}
              {activeTab === 'locations' && (
                <Button variant="primary" size="sm" onClick={() => setShowLocationModal(true)}>
                  <PlusIcon className="w-4 h-4" />
                  Add Location
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

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {isLoading && (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100">
            Loading inventory data from server. Please wait...
          </div>
        )}

        {/* ── LOW STOCK BANNER ── */}
        {lowStockItems.length > 0 && showInventoryAlerts && activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="hard-alert-blink mb-5 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3"
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

        {/* ════════════════════════════════════════════════════════════════
            TAB: STOCK OVERVIEW
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
              {[
                { label: 'Total Items', value: allInventoryItems.length, icon: <PackageIcon className="w-5 h-5 text-blue-400" />, color: 'text-blue-400' },
                { label: 'Total Stock Value', value: formatPrice(analytics.totalStockValue), icon: <TrendingUpIcon className="w-5 h-5 text-emerald-400" />, color: 'text-emerald-400' },
                { label: 'Low Stock', value: analytics.lowStockCount, icon: <AlertTriangleIcon className="w-5 h-5 text-amber-400" />, color: 'text-amber-400' },
                { label: 'Out of Stock', value: analytics.outOfStockCount, icon: <XCircleIcon className="w-5 h-5 text-red-400" />, color: 'text-red-400' },
                { label: 'Below Reorder', value: analytics.belowReorderCount, icon: <TruckIcon className="w-5 h-5 text-indigo-400" />, color: 'text-indigo-400' },
                { label: 'Past PO Value', value: formatPrice(pastPOValue), icon: <TruckIcon className="w-5 h-5 text-cyan-400" />, color: 'text-cyan-400' },
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
                {inventoryCategories.map((c) => (
                  <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
                ))}
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
                      const maxStock = Math.max(row.rec?.reorderQty ?? row.stock * 2, row.stock, 1);
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
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <p className="text-xs text-slate-500">{row.item.id} · {row.item.category.replace(/-/g, ' ')}</p>
                                  {menuItemMap[row.item.id] && row.rec && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                      <LinkIcon className="w-2.5 h-2.5" />
                                      menu
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <select
                                value={editValues.location ?? row.rec?.location ?? ''}
                                onChange={(e) => setEditValues((v) => ({ ...v, location: e.target.value }))}
                                className="w-32 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="">— None —</option>
                                {locations.map((loc) => (
                                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                                ))}
                              </select>
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
                                    placeholder="0"
                                    value={(editValues.stock ?? row.stock) === 0 ? '' : (editValues.stock ?? row.stock)}
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
                                placeholder="0"
                                value={(editValues.lowStockThreshold ?? row.rec?.lowStockThreshold ?? 0) === 0 ? '' : (editValues.lowStockThreshold ?? row.rec?.lowStockThreshold ?? 0)}
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
                                placeholder="0"
                                value={(editValues.reorderPoint ?? row.rec?.reorderPoint ?? 0) === 0 ? '' : (editValues.reorderPoint ?? row.rec?.reorderPoint ?? 0)}
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
                                placeholder="0"
                                value={(editValues.reorderQty ?? row.rec?.reorderQty ?? 0) === 0 ? '' : (editValues.reorderQty ?? row.rec?.reorderQty ?? 0)}
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
                                placeholder="0"
                                value={(editValues.unitCost ?? row.rec?.unitCost ?? 0) === 0 ? '' : (editValues.unitCost ?? row.rec?.unitCost ?? 0)}
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
                                    className="p-2 md:p-1.5 text-emerald-400 hover:text-emerald-300 transition"
                                    title="Save"
                                  >
                                    <CheckCircleIcon className="w-6 h-6 md:w-5 md:h-5" />
                                  </button>
                                  <button
                                    onClick={() => { setEditingRow(null); setEditValues({}); }}
                                    className="p-2 md:p-1.5 text-slate-400 hover:text-slate-200 transition"
                                    title="Cancel"
                                  >
                                    <XIcon className="w-6 h-6 md:w-5 md:h-5" />
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
                                    className="p-2 md:p-1.5 text-slate-400 hover:text-amber-400 transition"
                                    title="Edit"
                                  >
                                    <EditIcon className="w-6 h-6 md:w-5 md:h-5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setNewPO({ supplierId: suppliers[0]?.id ?? '', expectedDelivery: '', notes: `Auto reordering ${row.item.name} based on threshold` });
                                      setNewPOItems([{ menuItemId: row.item.id, orderedQty: Math.max((row.rec?.reorderQty ?? 5) - row.stock, 1), unit: '', unitCost: row.rec?.unitCost ?? 0 }]);
                                      setShowNewPO(true);
                                    }}
                                    className="p-2 md:p-1.5 text-emerald-400 hover:text-emerald-300 transition"
                                    title="Smart Reorder"
                                  >
                                    <PlusIcon className="w-6 h-6 md:w-5 md:h-5" />
                                  </button>
                                  {!menuItemMap[row.item.id] && (
                                    <button
                                      onClick={() => {
                                        setAddToMenuItemId(row.item.id);
                                        setAddToMenuName(row.item.name !== row.item.id ? row.item.name : '');
                                        setAddToMenuPrice(row.rec?.unitCost ?? 0);
                                        setAddToMenuCategory(menuCategories.find((c) => c !== 'all') ?? 'Food');
                                        setShowAddToMenuModal(true);
                                      }}
                                      className="p-2 md:p-1.5 text-blue-400 hover:text-blue-300 transition"
                                      title="Add to Menu"
                                    >
                                      <LinkIcon className="w-6 h-6 md:w-5 md:h-5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Delete inventory record for ${row.item.name}? This action cannot be undone.`)) {
                                        handleDeleteInventoryItem(row.item.id);
                                      }
                                    }}
                                    className="p-2 md:p-1.5 text-red-400 hover:text-red-300 transition"
                                    title="Delete"
                                  >
                                    <TrashIcon className="w-6 h-6 md:w-5 md:h-5" />
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

        {/* ── ADD TO MENU MODAL ── */}
        <Modal isOpen={showAddToMenuModal} onClose={closeAddToMenuModal}>
          <div className="p-5 space-y-4 max-w-md">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-blue-400" />
                Add to Menu
              </h3>
              <button onClick={closeAddToMenuModal} className="text-slate-400 hover:text-white">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-400">
              Create a menu item linked to this inventory record. Once linked, placing an order for this item will automatically deduct from stock.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Menu Item Name *</label>
                <input
                  type="text"
                  value={addToMenuName}
                  onChange={(e) => setAddToMenuName(e.target.value)}
                  placeholder="e.g. Grilled Chicken"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Price (RWF) *</label>
                <input
                  type="number"
                  value={addToMenuPrice || ''}
                  onChange={(e) => setAddToMenuPrice(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  min={0}
                  step={100}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Category *</label>
                <select
                  value={addToMenuCategory}
                  onChange={(e) => setAddToMenuCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {menuCategories.filter((c) => c !== 'all').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Food">Food</option>
                  <option value="Beverage">Beverage</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={closeAddToMenuModal} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddToMenu}
                isLoading={isAddingToMenu}
                className="flex-1 bg-blue-600 hover:bg-blue-500"
              >
                <LinkIcon className="w-4 h-4" />
                Add to Menu
              </Button>
            </div>
          </div>
        </Modal>

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

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Cost Audit Trail</h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {movements
                      .filter((m) => m.menuItemId === selectedItemDetails.item.id)
                      .filter((m) => m.reference === 'COST_CHANGE' || m.notes?.includes('COST_CHANGE|'))
                      .slice(0, 8)
                      .map((m) => {
                        const parsed = parseCostChangeNote(m.notes);
                        return (
                          <div key={`cost-${m.id}`} className="flex items-center justify-between bg-slate-850/70 p-2 rounded-lg text-xs">
                            <div>
                              <p className="text-slate-200">
                                Cost {parsed ? `${formatPrice(parsed.oldCost)} -> ${formatPrice(parsed.newCost)}` : 'updated'}
                              </p>
                              <p className="text-slate-400">{new Date(m.timestamp).toLocaleString()}</p>
                            </div>
                            <span className="text-slate-300">{m.performedBy || 'system'}</span>
                          </div>
                        );
                      })}
                    {movements
                      .filter((m) => m.menuItemId === selectedItemDetails.item.id)
                      .filter((m) => m.reference === 'COST_CHANGE' || m.notes?.includes('COST_CHANGE|')).length === 0 && (
                      <p className="text-slate-400 text-xs">No cost changes recorded yet.</p>
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
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${loc.isActive ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
                        {loc.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        onClick={() => { setEditingLocation({ ...loc }); setShowEditLocationModal(true); }}
                        className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors"
                        title="Edit location"
                      >
                        <EditIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteLocation(loc.id, loc.name)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete location"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
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
                <div className="py-16 text-center text-slate-500">
                  No locations found. Create locations like Kitchen, Bar, or Restaurant to support stock routing and operational redirection.
                </div>
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingLocation({ ...loc }); setShowEditLocationModal(true); }}
                              className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors"
                              title="Edit location"
                            >
                              <EditIcon className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteLocation(loc.id, loc.name)}
                              className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                              title="Delete location"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
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
                { label: 'Active POs', value: pendingPOCount, color: 'text-amber-400' },
                { label: 'Active Value', value: formatPrice(pendingPOValue), color: 'text-amber-400' },
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

            <div className="overflow-x-auto border border-slate-700/50 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50 border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">PO ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300">Items</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Expected</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Created</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredPurchaseOrders.map((po) => (
                    <tr 
                      key={po.id} 
                      className="bg-slate-800/30 hover:bg-slate-800/50 transition cursor-pointer border-slate-700/30"
                      onClick={() => setSelectedPO(po)}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-amber-400">
                        {po.id}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {po.supplierName}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusPill status={po.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 text-center">
                        {po.items.length}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-emerald-400 text-right">
                        {formatPrice(po.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {po.expectedDelivery}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {isManager && (po.status === 'confirmed' || po.status === 'sent' || po.status === 'partial') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReceiveModal(po);
                                setReceiveQtys(Object.fromEntries(po.items.map((i) => [i.menuItemId, i.orderedQty - i.receivedQty])));
                              }}
                              className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition"
                              title="Receive Delivery"
                            >
                              Receive
                            </button>
                          )}
                          {isManager && po.status === 'sent' && (
                            <button
                              onClick={async (e) => { e.stopPropagation(); try { await apiUpdatePurchaseOrder(po.id, { status: 'confirmed' }); await refresh(); alert('Purchase order confirmed'); } catch (err) { alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
                              className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition"
                              title="Confirm PO"
                            >
                              Confirm
                            </button>
                          )}
                          {isManager && po.status === 'draft' && (
                            <>
                              <button
                                onClick={async (e) => { e.stopPropagation(); try { await apiUpdatePurchaseOrder(po.id, { status: 'sent' }); await refresh(); alert('Purchase order sent successfully'); } catch (err) { console.error('Failed to send PO', err); alert(`Failed to send PO: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
                                className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition"
                                title="Send PO"
                              >
                                Send
                              </button>
                              <button
                                onClick={async (e) => { e.stopPropagation(); try { await apiUpdatePurchaseOrder(po.id, { status: 'cancelled' }); await refresh(); alert('Purchase order cancelled successfully'); } catch (err) { console.error('Failed to cancel PO', err); alert(`Failed to cancel PO: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
                                className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                                title="Cancel"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPurchaseOrders.length === 0 && (
                <div className="py-16 text-center text-slate-500 bg-slate-800/30">No purchase orders found.</div>
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setEditingSupplier(sup); setSupplierForm({ ...sup }); setEnablePortalAccess(false); setPortalEmail(sup.email ?? ''); setPortalName(sup.contactPerson ?? sup.name ?? ''); setPortalPhone(sup.phone ?? ''); setPortalPassword(generatePortalPassword()); setShowSupplierModal(true); }}
                        className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setEditingSupplier(sup); setSupplierForm({ ...sup }); setEnablePortalAccess(true); setPortalEmail(sup.email ?? ''); setPortalName(sup.contactPerson ?? sup.name ?? ''); setPortalPhone(sup.phone ?? ''); setPortalPassword(generatePortalPassword()); setShowSupplierModal(true); }}
                        className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition"
                      >
                        Grant Access
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
                <div className="flex gap-2">
                  {isManager && selectedPO.status === 'sent' && (
                    <button
                      onClick={async () => { try { await apiUpdatePurchaseOrder(selectedPO.id, { status: 'confirmed' }); await refresh(); setSelectedPO(null); } catch (err) { alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`); } }}
                      className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition"
                    >
                      Confirm PO
                    </button>
                  )}
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
                      placeholder="0"
                      value={(receiveQtys[i.menuItemId] ?? 0) === 0 ? '' : (receiveQtys[i.menuItemId] ?? 0)}
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
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Supplier</label>
                  <select
                    value={newPO.supplierId}
                    onChange={(e) => setNewPO((v) => ({ ...v, supplierId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={newPO.expectedDelivery}
                    onChange={(e) => setNewPO((v) => ({ ...v, expectedDelivery: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
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
                  onClick={() => setNewPOItems((v) => [...v, { menuItemId: '', orderedQty: 1, unit: '', unitCost: 0 }])}
                  className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                >
                  Add Item
                </button>
              </div>
              {newPOItems.length > 0 && (
                <div className="grid grid-cols-[1fr_80px_90px_90px_28px] gap-2 px-2 pb-0.5">
                  <span className="text-xs text-slate-500">Item</span>
                  <span className="text-xs text-slate-500">Qty</span>
                  <span className="text-xs text-slate-500">Unit</span>
                  <span className="text-xs text-slate-500">Cost (RWF)</span>
                  <span />
                </div>
              )}
              {newPOItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_90px_90px_28px] gap-2 items-center p-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                  <select
                    value={item.menuItemId}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, menuItemId: e.target.value } : i))}
                    className="px-2 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select Item</option>
                    <optgroup label="Menu Items">
                      {menuItems.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                    {allInventoryItems.filter(i => !i.isMenuItem).length > 0 && (
                      <optgroup label="Other Inventory Items">
                        {allInventoryItems.filter(i => !i.isMenuItem).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <input
                    type="number"
                    placeholder="0"
                    value={item.orderedQty === 0 ? '' : item.orderedQty}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, orderedQty: parseInt(e.target.value || '0', 10) } : i))}
                    className="px-2 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    min={1}
                  />
                  <select
                    value={item.unit}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, unit: e.target.value } : i))}
                    className="px-2 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">—</option>
                    <option value="units">Units</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="boxes">Boxes</option>
                    <option value="cases">Cases</option>
                    <option value="packs">Packs</option>
                    <option value="bags">Bags</option>
                    <option value="bottles">Bottles</option>
                    <option value="cans">Cans</option>
                  </select>
                  <input
                    type="number"
                    placeholder="0"
                    value={item.unitCost === 0 ? '' : item.unitCost}
                    onChange={(e) => setNewPOItems((v) => v.map((i, j) => j === idx ? { ...i, unitCost: parseFloat(e.target.value || '0') } : i))}
                    step="0.01"
                    className="px-2 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    min={0}
                  />
                  <button
                    type="button"
                    onClick={() => setNewPOItems((v) => v.filter((_, j) => j !== idx))}
                    className="flex items-center justify-center w-7 h-7 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                    title="Remove item"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
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
            </div>
          )}
        </Modal>

        {/* Add Inventory Item Modal */}
        <Modal isOpen={showAddInventoryModal} onClose={() => setShowAddInventoryModal(false)} title="Add Inventory Item">
          <div className="space-y-4">
            {/* Mode tabs */}
            <div className="flex rounded-lg bg-slate-800/60 p-1 gap-1">
              <button
                onClick={() => { setAddItemMode('menu'); setSelectedMenuItemId(''); setNewInventoryItemName(''); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  addItemMode === 'menu'
                    ? 'bg-amber-500 text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                From Menu
              </button>
              <button
                onClick={() => { setAddItemMode('standalone'); setSelectedMenuItemId(''); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  addItemMode === 'standalone'
                    ? 'bg-amber-500 text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Standalone Item
              </button>
            </div>

            {/* From Menu: pick an untracked menu item */}
            {addItemMode === 'menu' && (
              <div>
                <p className="text-xs text-slate-400 mb-2">
                  Select a menu item to track. Stock will auto-decrement on every order.
                </p>
                <input
                  placeholder="Search menu items..."
                  value={addMenuSearch}
                  onChange={(e) => setAddMenuSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-2"
                />
                {filteredUntrackedItems.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">
                    {untrackedMenuItems.length === 0
                      ? 'All menu items are already being tracked.'
                      : 'No items match your search.'}
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {filteredUntrackedItems.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedMenuItemId(m.id); setNewInventoryItemName(m.name); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                          selectedMenuItemId === m.id
                            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                            : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        <span className="text-lg">{(m as any).emoji ?? '🍽️'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{m.name}</p>
                          <p className="text-xs text-slate-400">{m.category}</p>
                        </div>
                        {selectedMenuItemId === m.id && (
                          <CheckCircleIcon className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standalone: freeform name */}
            {addItemMode === 'standalone' && (
              <div className="grid gap-3">
                <label className="block text-sm text-slate-300">
                  Item name
                  <input
                    placeholder="e.g. Paper Napkins, Cleaning Supplies"
                    value={newInventoryItemName}
                    onChange={(e) => setNewInventoryItemName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Standalone items are not linked to the menu and won't auto-decrement on orders.
                </p>
              </div>
            )}

            {/* Stock fields — shared by both modes */}
            {(addItemMode === 'standalone' || selectedMenuItemId) && (
              <>
                <div className="border-t border-slate-700/40 pt-3 grid grid-cols-2 gap-3">
                  <label className="block text-sm text-slate-300">
                    Current stock
                    <input
                      type="number" min={0}
                      value={newInventoryItemStock === 0 ? '' : newInventoryItemStock}
                      onChange={(e) => setNewInventoryItemStock(parseInt(e.target.value || '0', 10))}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Unit cost (RWF)
                    <input
                      type="number" min={0} step="0.01"
                      value={newInventoryItemUnitCost === 0 ? '' : newInventoryItemUnitCost}
                      onChange={(e) => setNewInventoryItemUnitCost(parseFloat(e.target.value || '0'))}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Low-stock alert below
                    <input
                      type="number" min={0}
                      value={newInventoryItemLowThreshold === 0 ? '' : newInventoryItemLowThreshold}
                      onChange={(e) => setNewInventoryItemLowThreshold(parseInt(e.target.value || '0', 10))}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Unit measurement
                    <select
                      value={newInventoryItemUnitMeasurement}
                      onChange={(e) => setNewInventoryItemUnitMeasurement(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {['units','kg','g','L','ml','boxes','cases','packs','bags','bottles','cans'].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-300">
                    Reorder point
                    <input
                      type="number" min={0}
                      value={newInventoryItemReorderPoint === 0 ? '' : newInventoryItemReorderPoint}
                      onChange={(e) => setNewInventoryItemReorderPoint(parseInt(e.target.value || '0', 10))}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Reorder qty
                    <input
                      type="number" min={0}
                      value={newInventoryItemReorderQty === 0 ? '' : newInventoryItemReorderQty}
                      onChange={(e) => setNewInventoryItemReorderQty(parseInt(e.target.value || '0', 10))}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block col-span-2 text-sm text-slate-300">
                    Storage location
                    <select
                      value={newInventoryItemLocation}
                      onChange={(e) => setNewInventoryItemLocation(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">— None —</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.name}>{loc.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700/30">
              <button
                onClick={() => setShowAddInventoryModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOtherInventoryItem}
                disabled={addItemMode === 'menu' ? !selectedMenuItemId : !newInventoryItemName.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addItemMode === 'menu' ? 'Start Tracking' : 'Create Item'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Supplier Modal */}
        <Modal isOpen={showSupplierModal} onClose={() => { setShowSupplierModal(false); setEditingSupplier(null); setSupplierForm({}); setEnablePortalAccess(false); setPortalEmail(''); setPortalName(''); setPortalPhone(''); setPortalPassword(''); }} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
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

            <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
              <label className="flex items-center gap-2 text-slate-200 text-sm">
                <input
                  type="checkbox"
                  checked={enablePortalAccess}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnablePortalAccess(checked);
                    if (checked) {
                      setPortalEmail((prev) => prev || (supplierForm.email ?? ''));
                      setPortalName((prev) => prev || (supplierForm.contactPerson ?? supplierForm.name ?? ''));
                      setPortalPhone((prev) => prev || (supplierForm.phone ?? ''));
                      setPortalPassword((prev) => prev || generatePortalPassword());
                    }
                  }}
                  className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                Enable Supplier Portal Access
              </label>

              {enablePortalAccess && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Portal Email"
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      placeholder="Portal Name"
                      value={portalName}
                      onChange={(e) => setPortalName(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Portal Phone (optional)"
                      value={portalPhone}
                      onChange={(e) => setPortalPhone(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <input
                        placeholder="Portal Password"
                        value={portalPassword}
                        onChange={(e) => setPortalPassword(e.target.value)}
                        className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setPortalPassword(generatePortalPassword())}
                        className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600 transition"
                        title="Generate password"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    The manager creates and shares these credentials with the supplier for portal login.
                  </p>
                </div>
              )}
            </div>
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
                onClick={() => { setShowSupplierModal(false); setEditingSupplier(null); setSupplierForm({}); setEnablePortalAccess(false); setPortalEmail(''); setPortalName(''); setPortalPhone(''); setPortalPassword(''); }}
                className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={provisioningPortal}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {provisioningPortal ? 'Provisioning...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={!!provisionedAccess} onClose={() => setProvisionedAccess(null)} title="Supplier Portal Credentials">
          {provisionedAccess && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Share these credentials with the supplier.
              </p>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200 space-y-1">
                <p><span className="text-slate-400">Supplier:</span> {provisionedAccess.supplierName}</p>
                <p><span className="text-slate-400">Email:</span> {provisionedAccess.email}</p>
                <p><span className="text-slate-400">Password:</span> {provisionedAccess.password}</p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setProvisionedAccess(null)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 transition"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </Modal>

        <Modal isOpen={showLocationModal} onClose={() => setShowLocationModal(false)} title="Add Inventory Location">
          <div className="space-y-3">
            <input
              value={newLocation.name}
              onChange={(e) => setNewLocation((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Location name (e.g., Kitchen, Bar, Restaurant)"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <select
              value={newLocation.type}
              onChange={(e) => setNewLocation((prev) => ({ ...prev, type: e.target.value as typeof prev.type }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {['kitchen', 'bar', 'warehouse', 'walk_in', 'dry_store', 'cold_room', 'freezer', 'display', 'other'].map((type) => (
                <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input
              value={newLocation.capacity}
              onChange={(e) => setNewLocation((prev) => ({ ...prev, capacity: e.target.value }))}
              placeholder="Capacity (optional)"
              type="number"
              min={0}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              value={newLocation.temperatureRange}
              onChange={(e) => setNewLocation((prev) => ({ ...prev, temperatureRange: e.target.value }))}
              placeholder="Temperature range (optional)"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <textarea
              value={newLocation.description}
              onChange={(e) => setNewLocation((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/30">
              <button
                onClick={() => setShowLocationModal(false)}
                className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateLocation}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition"
              >
                Save Location
              </button>
            </div>
          </div>
        </Modal>

        {/* Edit Location Modal */}
        {editingLocation && (
          <Modal isOpen={showEditLocationModal} onClose={() => { setShowEditLocationModal(false); setEditingLocation(null); }} title="Edit Location">
            <div className="space-y-3">
              <input
                value={editingLocation.name}
                onChange={(e) => setEditingLocation((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                placeholder="Location name"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <select
                value={editingLocation.type}
                onChange={(e) => setEditingLocation((prev) => prev ? { ...prev, type: e.target.value as typeof prev.type } : prev)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {['kitchen', 'bar', 'warehouse', 'walk_in', 'dry_store', 'cold_room', 'freezer', 'display', 'other'].map((type) => (
                  <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input
                value={editingLocation.capacity ?? ''}
                onChange={(e) => setEditingLocation((prev) => prev ? { ...prev, capacity: e.target.value ? Number(e.target.value) : undefined } : prev)}
                placeholder="Capacity (optional)"
                type="number"
                min={0}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                value={editingLocation.temperatureRange ?? ''}
                onChange={(e) => setEditingLocation((prev) => prev ? { ...prev, temperatureRange: e.target.value } : prev)}
                placeholder="Temperature range (optional)"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <textarea
                value={editingLocation.description ?? ''}
                onChange={(e) => setEditingLocation((prev) => prev ? { ...prev, description: e.target.value } : prev)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editLocActive"
                  checked={editingLocation.isActive}
                  onChange={(e) => setEditingLocation((prev) => prev ? { ...prev, isActive: e.target.checked } : prev)}
                  className="rounded"
                />
                <label htmlFor="editLocActive" className="text-sm text-slate-300">Active</label>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/30">
                <button
                  onClick={() => { setShowEditLocationModal(false); setEditingLocation(null); }}
                  className="px-3 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLocation}
                  className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </Modal>
        )}

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
                <optgroup label="Menu Items">
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                {allInventoryItems.filter(i => !i.isMenuItem).length > 0 && (
                  <optgroup label="Other Items">
                    {allInventoryItems.filter(i => !i.isMenuItem).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </optgroup>
                )}
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
