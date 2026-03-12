import type {
  InventoryRecord,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  StockMovement,
  StockMovementType,
  WasteEntry,
  WasteReason,
  InventoryAnalytics,
} from '../types/inventory';
import type { MenuItem } from '../types';
import { menuItems as fallbackMenuItems } from '../data/menuData';

// ── Storage Keys ────────────────────────────────────────────────────────────
const KEYS = {
  inventory: 'inventoryRecords',
  suppliers: 'inventorySuppliers',
  purchaseOrders: 'inventoryPurchaseOrders',
  movements: 'inventoryMovements',
  waste: 'inventoryWaste',
} as const;

type InventoryMap = Record<string, InventoryRecord>;

// ── Helpers ─────────────────────────────────────────────────────────────────
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded – silently ignore
  }
}

// ── Default values ───────────────────────────────────────────────────────────
function defaultThreshold(item: MenuItem): number {
  if (item.category === 'beers' || item.category === 'soft-drinks') return 6;
  if (item.category === 'wine' || item.category === 'alcoholic-drinks') return 3;
  return 4;
}

function defaultStock(item: MenuItem): number {
  if (item.category === 'beers' || item.category === 'soft-drinks') return 34;
  if (item.category === 'wine' || item.category === 'alcoholic-drinks') return 18;
  return 20;
}

function defaultUnitCost(item: MenuItem): number {
  // Approximate cost as ~40% of selling price
  return Math.round(item.price * 0.4);
}

function defaultLocation(item: MenuItem): string {
  if (item.category === 'beers' || item.category === 'soft-drinks') return 'Bar Fridge';
  if (item.category === 'wine' || item.category === 'alcoholic-drinks') return 'Wine Cellar';
  return 'Dry Store';
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY MAP
// ═══════════════════════════════════════════════════════════════════════════

export function loadInventoryMap(): InventoryMap {
  return load<InventoryMap>(KEYS.inventory, {});
}

export function saveInventoryMap(map: InventoryMap) {
  save(KEYS.inventory, map);
}

export function ensureInventoryInitialized(menuItems: MenuItem[] = fallbackMenuItems) {
  const map = loadInventoryMap();
  let changed = false;
  for (const item of menuItems) {
    if (!map[item.id]) {
      map[item.id] = {
        menuItemId: item.id,
        stock: defaultStock(item),
        lowStockThreshold: defaultThreshold(item),
        reorderPoint: defaultThreshold(item) + 2,
        reorderQty: defaultStock(item),
        unitCost: defaultUnitCost(item),
        location: defaultLocation(item),
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    } else {
      // Backfill new fields for existing records
      let patched = false;
      const rec = map[item.id];
      if (rec.reorderPoint === undefined) { rec.reorderPoint = defaultThreshold(item) + 2; patched = true; }
      if (rec.reorderQty === undefined) { rec.reorderQty = defaultStock(item); patched = true; }
      if (rec.unitCost === undefined) { rec.unitCost = defaultUnitCost(item); patched = true; }
      if (rec.location === undefined) { rec.location = defaultLocation(item); patched = true; }
      if (patched) changed = true;
    }
  }
  if (changed) saveInventoryMap(map);
}

export function getStock(menuItemId: string): InventoryRecord | null {
  return loadInventoryMap()[menuItemId] ?? null;
}

export function setStock(menuItemId: string, stock: number) {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  map[menuItemId] = {
    menuItemId,
    stock: Math.max(0, Math.floor(stock)),
    lowStockThreshold: existing?.lowStockThreshold ?? 3,
    reorderPoint: existing?.reorderPoint ?? 5,
    reorderQty: existing?.reorderQty ?? 20,
    unitCost: existing?.unitCost ?? 0,
    location: existing?.location,
    updatedAt: new Date().toISOString(),
  };
  saveInventoryMap(map);
}

export function setLowStockThreshold(menuItemId: string, threshold: number) {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  if (!existing) return;
  map[menuItemId] = { ...existing, lowStockThreshold: Math.max(0, Math.floor(threshold)), updatedAt: new Date().toISOString() };
  saveInventoryMap(map);
}

export function updateInventoryRecord(
  menuItemId: string,
  patch: Partial<Omit<InventoryRecord, 'menuItemId' | 'updatedAt'>>
) {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  if (!existing) return;
  map[menuItemId] = { ...existing, ...patch, menuItemId, updatedAt: new Date().toISOString() };
  saveInventoryMap(map);
}

export function decrementInventoryForOrder(
  items: { menuItemId: string; quantity: number }[],
  orderId?: string,
  menuItemsRef: MenuItem[] = fallbackMenuItems
) {
  const map = loadInventoryMap();
  const now = new Date().toISOString();
  const movements: StockMovement[] = [];

  for (const it of items) {
    const existing = map[it.menuItemId] ?? {
      menuItemId: it.menuItemId,
      stock: 0,
      lowStockThreshold: 3,
      reorderPoint: 5,
      reorderQty: 20,
      unitCost: 0,
      updatedAt: now,
    };
    const stockBefore = existing.stock ?? 0;
    const stockAfter = Math.max(0, stockBefore - it.quantity);
    map[it.menuItemId] = { ...existing, stock: stockAfter, updatedAt: now };

    const menuItem = menuItemsRef.find((m) => m.id === it.menuItemId);
    movements.push({
      id: uid(),
      menuItemId: it.menuItemId,
      menuItemName: menuItem?.name ?? it.menuItemId,
      type: 'sale',
      qty: -it.quantity,
      stockBefore,
      balanceAfter: stockAfter,
      unitCost: existing.unitCost,
      totalValue: existing.unitCost * it.quantity,
      reference: orderId,
      performedBy: 'System',
      timestamp: now,
    });
  }

  saveInventoryMap(map);
  appendMovements(movements);
}

export function listLowStock(menuItems: MenuItem[] = fallbackMenuItems) {
  ensureInventoryInitialized(menuItems);
  const map = loadInventoryMap();
  return menuItems
    .map((mi) => {
      const rec = map[mi.id]!;
      return { item: mi, stock: rec.stock, lowStockThreshold: rec.lowStockThreshold };
    })
    .filter((x) => x.stock <= x.lowStockThreshold)
    .sort((a, b) => a.stock - b.stock);
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════

export function loadSuppliers(): Supplier[] {
  return load<Supplier[]>(KEYS.suppliers, []);
}

export function saveSuppliers(suppliers: Supplier[]) {
  save(KEYS.suppliers, suppliers);
}

export function ensureSuppliersInitialized() {
  const existing = loadSuppliers();
  if (existing.length > 0) return;

  const defaults: Supplier[] = [
    {
      id: 'sup-001',
      name: 'Bralirwa Beverages',
      contactPerson: 'Jean-Pierre Habimana',
      email: 'jp.habimana@bralirwa.rw',
      phone: '+250 788 100 200',
      address: 'KG 7 Ave, Kigali Industrial Zone',
      categories: ['beers', 'soft-drinks'],
      leadTimeDays: 2,
      paymentTerms: 'Net 14',
      rating: 5,
      isActive: true,
      createdAt: new Date().toISOString(),
      notes: 'Primary beer & soft drink supplier. Delivers Mon/Wed/Fri.',
    },
    {
      id: 'sup-002',
      name: 'Kigali Wine Imports',
      contactPerson: 'Marie Uwimana',
      email: 'marie@kigaliwine.rw',
      phone: '+250 722 300 400',
      address: 'KN 3 Rd, Nyarugenge, Kigali',
      categories: ['wine', 'alcoholic-drinks'],
      leadTimeDays: 5,
      paymentTerms: 'Net 30',
      rating: 4,
      isActive: true,
      createdAt: new Date().toISOString(),
      notes: 'Imports European wines and premium spirits.',
    },
    {
      id: 'sup-003',
      name: 'Fresh Farm Produce',
      contactPerson: 'Emmanuel Nkurunziza',
      email: 'e.nkurunziza@freshfarm.rw',
      phone: '+250 733 500 600',
      address: 'Kimironko Market, Kigali',
      categories: ['breakfast', 'lunch', 'dinner'],
      leadTimeDays: 1,
      paymentTerms: 'COD',
      rating: 4,
      isActive: true,
      createdAt: new Date().toISOString(),
      notes: 'Daily fresh produce delivery. Call by 6am for same-day.',
    },
  ];

  saveSuppliers(defaults);
}

export function addSupplier(data: Omit<Supplier, 'id' | 'createdAt'>): Supplier {
  const suppliers = loadSuppliers();
  const newSupplier: Supplier = { ...data, id: `sup-${uid()}`, createdAt: new Date().toISOString() };
  saveSuppliers([...suppliers, newSupplier]);
  return newSupplier;
}

export function updateSupplier(id: string, patch: Partial<Omit<Supplier, 'id' | 'createdAt'>>) {
  const suppliers = loadSuppliers();
  saveSuppliers(suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function deleteSupplier(id: string) {
  saveSuppliers(loadSuppliers().filter((s) => s.id !== id));
}

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════

export function loadPurchaseOrders(): PurchaseOrder[] {
  return load<PurchaseOrder[]>(KEYS.purchaseOrders, []);
}

export function savePurchaseOrders(orders: PurchaseOrder[]) {
  save(KEYS.purchaseOrders, orders);
}

export function ensurePurchaseOrdersInitialized() {
  const existing = loadPurchaseOrders();
  if (existing.length > 0) return;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];

  const defaults: PurchaseOrder[] = [
    {
      id: 'PO-2026-001',
      supplierId: 'sup-001',
      supplierName: 'Bralirwa Beverages',
      status: 'received',
      items: [
        { menuItemId: 'beer-001', menuItemName: 'Mutzig', orderedQty: 48, receivedQty: 48, unitCost: 1000, totalCost: 48000 },
        { menuItemId: 'beer-002', menuItemName: 'Primus', orderedQty: 48, receivedQty: 48, unitCost: 800, totalCost: 38400 },
        { menuItemId: 'soft-004', menuItemName: 'Coca-Cola', orderedQty: 24, receivedQty: 24, unitCost: 800, totalCost: 19200 },
      ],
      totalCost: 105600,
      expectedDelivery: yesterday.split('T')[0],
      createdAt: threeDaysAgo,
      updatedAt: yesterday,
      receivedAt: yesterday,
      createdBy: 'Manager',
    },
    {
      id: 'PO-2026-002',
      supplierId: 'sup-002',
      supplierName: 'Kigali Wine Imports',
      status: 'confirmed',
      items: [
        { menuItemId: 'wine-001', menuItemName: 'Château Margaux 2018', orderedQty: 6, receivedQty: 0, unitCost: 26000, totalCost: 156000 },
        { menuItemId: 'wine-002', menuItemName: 'Pinot Grigio', orderedQty: 12, receivedQty: 0, unitCost: 2800, totalCost: 33600 },
        { menuItemId: 'wine-004', menuItemName: 'Provence Rosé', orderedQty: 12, receivedQty: 0, unitCost: 3600, totalCost: 43200 },
      ],
      totalCost: 232800,
      expectedDelivery: tomorrow,
      createdAt: threeDaysAgo,
      updatedAt: yesterday,
      createdBy: 'Manager',
      notes: 'Urgent restock for weekend service.',
    },
    {
      id: 'PO-2026-003',
      supplierId: 'sup-003',
      supplierName: 'Fresh Farm Produce',
      status: 'draft',
      items: [
        { menuItemId: 'bfast-001', menuItemName: 'Classic Eggs Benedict', orderedQty: 30, receivedQty: 0, unitCost: 4400, totalCost: 132000 },
        { menuItemId: 'dinner-001', menuItemName: 'Ribeye Steak', orderedQty: 20, receivedQty: 0, unitCost: 11200, totalCost: 224000 },
      ],
      totalCost: 356000,
      expectedDelivery: nextWeek,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: 'Manager',
    },
  ];

  savePurchaseOrders(defaults);
}

export function createPurchaseOrder(
  data: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>
): PurchaseOrder {
  const orders = loadPurchaseOrders();
  const count = orders.length + 1;
  const year = new Date().getFullYear();
  const po: PurchaseOrder = {
    ...data,
    id: `PO-${year}-${String(count).padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  savePurchaseOrders([...orders, po]);
  return po;
}

export function updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>) {
  const orders = loadPurchaseOrders();
  savePurchaseOrders(
    orders.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o))
  );
}

export function receivePurchaseOrder(
  poId: string,
  receivedItems: { menuItemId: string; receivedQty: number }[],
  performedBy: string,
  menuItemsRef: MenuItem[] = fallbackMenuItems
) {
  const orders = loadPurchaseOrders();
  const po = orders.find((o) => o.id === poId);
  if (!po) return;

  const map = loadInventoryMap();
  const now = new Date().toISOString();
  const movements: StockMovement[] = [];

  const updatedItems = po.items.map((item) => {
    const received = receivedItems.find((r) => r.menuItemId === item.menuItemId);
    const qty = received?.receivedQty ?? 0;
    if (qty > 0) {
      const existing = map[item.menuItemId];
      if (existing) {
        const stockBefore = existing.stock;
        const stockAfter = stockBefore + qty;
        map[item.menuItemId] = { ...existing, stock: stockAfter, unitCost: item.unitCost, updatedAt: now };
        movements.push({
          id: uid(),
          menuItemId: item.menuItemId,
          menuItemName: item.menuItemName,
          type: 'purchase',
          qty,
          stockBefore,
          balanceAfter: stockAfter,
          unitCost: item.unitCost,
          totalValue: item.unitCost * qty,
          reference: poId,
          performedBy,
          timestamp: now,
        });
      }
    }
    return { ...item, receivedQty: (item.receivedQty ?? 0) + qty };
  });

  const allReceived = updatedItems.every((i) => i.receivedQty >= i.orderedQty);
  const anyReceived = updatedItems.some((i) => i.receivedQty > 0);
  const newStatus: PurchaseOrderStatus = allReceived ? 'received' : anyReceived ? 'partial' : po.status;

  saveInventoryMap(map);
  appendMovements(movements);
  savePurchaseOrders(
    orders.map((o) =>
      o.id === poId
        ? { ...o, items: updatedItems, status: newStatus, receivedAt: allReceived ? now : o.receivedAt, updatedAt: now }
        : o
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK MOVEMENTS
// ═══════════════════════════════════════════════════════════════════════════

export function loadMovements(): StockMovement[] {
  return load<StockMovement[]>(KEYS.movements, []);
}

export function saveMovements(movements: StockMovement[]) {
  save(KEYS.movements, movements);
}

export function appendMovements(newMovements: StockMovement[]) {
  const existing = loadMovements();
  // Keep last 500 movements to avoid localStorage bloat
  const combined = [...newMovements, ...existing].slice(0, 500);
  saveMovements(combined);
}

export function recordManualAdjustment(
  menuItemId: string,
  menuItemName: string,
  newStock: number,
  performedBy: string,
  notes?: string
) {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  if (!existing) return;

  const stockBefore = existing.stock;
  const stockAfter = Math.max(0, Math.floor(newStock));
  const qty = stockAfter - stockBefore;

  map[menuItemId] = { ...existing, stock: stockAfter, updatedAt: new Date().toISOString() };
  saveInventoryMap(map);

  appendMovements([{
    id: uid(),
    menuItemId,
    menuItemName,
    type: 'adjustment',
    qty,
    stockBefore,
    balanceAfter: stockAfter,
    performedBy,
    notes,
    timestamp: new Date().toISOString(),
  }]);
}

// ═══════════════════════════════════════════════════════════════════════════
// WASTE LOG
// ═══════════════════════════════════════════════════════════════════════════

export function loadWasteLog(): WasteEntry[] {
  return load<WasteEntry[]>(KEYS.waste, []);
}

export function saveWasteLog(entries: WasteEntry[]) {
  save(KEYS.waste, entries);
}

export function recordWaste(
  menuItemId: string,
  menuItemName: string,
  qty: number,
  reason: WasteReason,
  reportedBy: string,
  notes?: string
): WasteEntry {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  const unitCost = existing?.unitCost ?? 0;
  const totalCost = unitCost * qty;
  const now = new Date().toISOString();

  if (existing) {
    const stockBefore = existing.stock;
    const stockAfter = Math.max(0, stockBefore - qty);
    map[menuItemId] = { ...existing, stock: stockAfter, updatedAt: now };
    saveInventoryMap(map);

    appendMovements([{
      id: uid(),
      menuItemId,
      menuItemName,
      type: 'waste',
      qty: -qty,
      stockBefore,
      balanceAfter: stockAfter,
      unitCost,
      totalValue: totalCost,
      performedBy: reportedBy,
      notes: `Waste: ${reason}`,
      timestamp: now,
    }]);
  }

  const entry: WasteEntry = {
    id: uid(),
    menuItemId,
    menuItemName,
    qty,
    unitCost,
    totalCost,
    reason,
    reportedBy,
    recordedBy: reportedBy,
    notes,
    timestamp: now,
  };

  const log = loadWasteLog();
  saveWasteLog([entry, ...log].slice(0, 200));
  return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export function computeInventoryAnalytics(
  menuItems: MenuItem[] = fallbackMenuItems
): InventoryAnalytics {
  ensureInventoryInitialized(menuItems);
  const map = loadInventoryMap();
  const wasteLog = loadWasteLog();
  const pos = loadPurchaseOrders();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  let totalStockValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let belowReorderCount = 0;

  const categoryMap: Record<string, { stockValue: number; itemCount: number }> = {};

  for (const item of menuItems) {
    const rec = map[item.id];
    if (!rec) continue;
    const value = rec.stock * rec.unitCost;
    totalStockValue += value;
    if (rec.stock === 0) outOfStockCount++;
    else if (rec.stock <= rec.lowStockThreshold) lowStockCount++;
    if (rec.stock <= (rec.reorderPoint ?? rec.lowStockThreshold)) belowReorderCount++;

    const cat = item.category;
    if (!categoryMap[cat]) categoryMap[cat] = { stockValue: 0, itemCount: 0 };
    categoryMap[cat].stockValue += value;
    categoryMap[cat].itemCount += 1;
  }

  const pendingPOs = pos.filter((p) => ['draft', 'sent', 'confirmed', 'partial'].includes(p.status));
  const pendingPOValue = pendingPOs.reduce((s, p) => s + p.totalCost, 0);

  const last30dWaste = wasteLog.filter((w) => w.timestamp >= thirtyDaysAgo);
  const wasteCostLast30d = last30dWaste.reduce((s, w) => s + w.totalCost, 0);

  const wasteByReason: Record<string, { qty: number; cost: number }> = {};
  for (const w of last30dWaste) {
    if (!wasteByReason[w.reason]) wasteByReason[w.reason] = { qty: 0, cost: 0 };
    wasteByReason[w.reason].qty += w.qty;
    wasteByReason[w.reason].cost += w.totalCost;
  }
  const wasteByReasonList = Object.entries(wasteByReason).map(([reason, data]) => ({ reason, ...data }));
  const topWasteReason = wasteByReasonList.length > 0 ? wasteByReasonList.reduce((a, b) => (a.cost > b.cost ? a : b)).reason : null;

  const wasteByItem: Record<string, { menuItemId: string; menuItemName: string; qty: number; cost: number }> = {};
  for (const w of last30dWaste) {
    if (!wasteByItem[w.menuItemId]) wasteByItem[w.menuItemId] = { menuItemId: w.menuItemId, menuItemName: w.menuItemName, qty: 0, cost: 0 };
    wasteByItem[w.menuItemId].qty += w.qty;
    wasteByItem[w.menuItemId].cost += w.totalCost;
  }
  const topWasteItems = Object.values(wasteByItem)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const movements = loadMovements();
  const salesQty = movements.filter((m) => m.type === 'sale').reduce((s, m) => s + Math.abs(m.qty), 0);
  const avgStock = totalStockValue > 0 ? totalStockValue / Math.max(menuItems.length, 1) : 1;
  const stockTurnoverRate = avgStock > 0 ? parseFloat((salesQty / Math.max(avgStock / 1000, 1)).toFixed(2)) : 0;
  const avgTurnoverDays = stockTurnoverRate > 0 ? parseFloat((30 / stockTurnoverRate).toFixed(1)) : 0;

  return {
    totalStockValue,
    lowStockCount,
    outOfStockCount,
    pendingPOCount: pendingPOs.length,
    pendingPOValue,
    wasteCostLast30d,
    avgTurnoverDays,
    belowReorderCount,
    topWasteReason,
    wasteByReason: wasteByReasonList,
    topWasteItems,
    stockTurnoverRate,
    categoryBreakdown: Object.entries(categoryMap).map(([category, data]) => ({
      category,
      ...data,
    })),
  };
}
