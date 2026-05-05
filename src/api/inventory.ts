import { supabase } from '../lib/supabase';
import type {
  InventoryRecord,
  Supplier,
  PurchaseOrder,
  StockMovement,
  WasteEntry,
  InventoryAnalytics,
  InventoryLocation,
  InventoryForecast,
  PurchaseOrderStatus,
} from '../types/inventory';
export type { InventoryRecord };
import { apiRequest } from './http';

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '';

function getRestaurantId(): string | undefined {
  if (typeof window !== 'undefined') {
    const direct = localStorage.getItem('restaurantId');
    if (direct && direct.trim()) return direct;

    const authUserRaw = localStorage.getItem('authUser');
    if (authUserRaw) {
      try {
        const authUser = JSON.parse(authUserRaw);
        const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
        if (typeof fallbackId === 'string' && fallbackId.trim()) {
          localStorage.setItem('restaurantId', fallbackId);
          return fallbackId;
        }
      } catch {
        // Ignore malformed authUser payload and return undefined below
      }
    }

    return undefined;
  }
  return undefined;
}

function getStaffId(): string {
  return localStorage.getItem('staffId') || 'system';
}

function toDbDecimal(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 100) / 100;
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeInventoryRecord(raw: any): InventoryRecord {
  const currentQty = raw.current_qty ?? raw.currentQty ?? raw.stock ?? 0;
  const cost = raw.cost ?? raw.unit_cost ?? raw.unitCost ?? 0;
  const price = raw.price ?? raw.selling_price ?? raw.sellingPrice ?? 0;
  return {
    menuItemId:        raw.menu_item_id   ?? raw.menuItemId   ?? '',
    stock:             currentQty,
    lowStockThreshold: raw.low_stock_threshold ?? raw.lowStockThreshold ?? 5,
    reorderPoint:      raw.reorder_point   ?? raw.reorderPoint ?? 10,
    reorderQty:        raw.reorder_qty     ?? raw.reorderQty   ?? 20,
    unitCost:          cost,
    supplierId:        raw.supplier_id     ?? raw.supplierId   ?? undefined,
    location:          raw.location        ?? '',
    updatedAt:         raw.updated_at      ?? raw.updatedAt    ?? new Date().toISOString(),
    // Extended fields for minimart inventory sheet format.
    description:       raw.description     ?? raw.item_description ?? '',
    expiryDate:        raw.expiry_date     ?? raw.expiryDate ?? '',
    purchaseDate:      raw.purchase_date   ?? raw.purchaseDate ?? '',
    qtyStart:          raw.qty_start       ?? raw.qtyStart ?? currentQty,
    currentQty,
    cost,
    price,
  };
}

async function recordCostChangeAudit(params: {
  menuItemId: string;
  restaurantId: string;
  performedBy: string;
  oldCost: number;
  newCost: number;
  stockBefore: number;
  stockAfter: number;
}): Promise<void> {
  if (params.oldCost === params.newCost) return;

  const movementId = `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const note = `COST_CHANGE|old=${params.oldCost}|new=${params.newCost}`;

  const { error } = await supabase
    .from('stock_movements')
    .insert({
      id: movementId,
      menu_item_id: params.menuItemId,
      menu_item_name: params.menuItemId,
      type: 'adjustment',
      qty: 0,
      stock_before: params.stockBefore,
      balance_after: params.stockAfter,
      unit_cost: params.newCost,
      reference: 'COST_CHANGE',
      performed_by: params.performedBy,
      notes: note,
      restaurant_id: params.restaurantId,
    });

  if (error) {
    console.warn('[recordCostChangeAudit] Failed to persist cost-change audit:', error.message);
  }
}

function normalizeSupplier(raw: any): Supplier {
  return {
    id:            raw.id,
    name:          raw.name           ?? '',
    contactPerson: raw.contact_person ?? raw.contactPerson ?? '',
    email:         raw.email          ?? '',
    phone:         raw.phone          ?? '',
    address:       raw.address        ?? '',
    categories:    raw.categories     ?? [],
    leadTimeDays:  raw.lead_time_days ?? raw.leadTimeDays ?? 7,
    paymentTerms:  raw.payment_terms  ?? raw.paymentTerms ?? 'Net 30',
    rating:        raw.rating         ?? 3,
    isActive:      raw.is_active      ?? raw.isActive     ?? true,
    notes:         raw.notes          ?? '',
    createdAt:     raw.created_at     ?? raw.createdAt    ?? new Date().toISOString(),
  };
}

function normalizePurchaseOrder(raw: any): PurchaseOrder {
  const normalizePoStatus = (value: any): PurchaseOrderStatus => {
    const normalized = String(value ?? 'draft').toLowerCase().trim();
    if (normalized === 'draft' || normalized === 'sent' || normalized === 'confirmed' || normalized === 'partial' || normalized === 'received' || normalized === 'cancelled') {
      return normalized;
    }
    return 'draft';
  };

  const items = Array.isArray(raw.items) ? raw.items.map((i: any) => ({
    menuItemId:   i.menu_item_id   ?? i.menuItemId   ?? '',
    menuItemName: i.menu_item_name ?? i.menuItemName ?? '',
    orderedQty:   i.ordered_qty    ?? i.orderedQty   ?? 0,
    receivedQty:  i.received_qty   ?? i.receivedQty  ?? 0,
    unitCost:     i.unit_cost      ?? i.unitCost     ?? 0,
    totalCost:    i.total_cost     ?? i.totalCost    ?? 0,
  })) : [];

  return {
    id:               raw.id,
    supplierId:       raw.supplier_id       ?? raw.supplierId       ?? '',
    supplierName:     raw.supplier_name     ?? raw.supplierName     ?? '',
    status:           normalizePoStatus(raw.status),
    items,
    totalCost:        raw.total_cost        ?? raw.totalCost        ?? 0,
    expectedDelivery: raw.expected_delivery ?? raw.expectedDelivery ?? null,
    createdAt:        raw.created_at        ?? raw.createdAt        ?? new Date().toISOString(),
    updatedAt:        raw.updated_at        ?? raw.updatedAt        ?? new Date().toISOString(),
    receivedAt:       raw.received_at       ?? raw.receivedAt       ?? null,
    createdBy:        raw.created_by        ?? raw.createdBy        ?? '',
    notes:            raw.notes             ?? null,
  };
}

function normalizeMovement(raw: any): StockMovement {
  return {
    id:           raw.id,
    menuItemId:   raw.menu_item_id   ?? raw.menuItemId   ?? '',
    menuItemName: raw.menu_item_name ?? raw.menuItemName ?? '',
    type:         raw.type           ?? 'adjustment',
    qty:          raw.qty            ?? 0,
    stockBefore:  raw.stock_before   ?? raw.stockBefore  ?? 0,
    balanceAfter: raw.balance_after  ?? raw.balanceAfter ?? 0,
    unitCost:     raw.unit_cost      ?? raw.unitCost,
    totalValue:   raw.total_value    ?? raw.totalValue,
    reference:    raw.reference      ?? null,
    performedBy:  raw.performed_by   ?? raw.performedBy  ?? '',
    notes:        raw.notes          ?? null,
    timestamp:    raw.timestamp      ?? raw.created_at   ?? new Date().toISOString(),
  };
}

function normalizeWasteEntry(raw: any): WasteEntry {
  return {
    id:           raw.id,
    menuItemId:   raw.menu_item_id   ?? raw.menuItemId   ?? '',
    menuItemName: raw.menu_item_name ?? raw.menuItemName ?? '',
    qty:          raw.qty            ?? 0,
    unitCost:     raw.unit_cost      ?? raw.unitCost     ?? 0,
    totalCost:    raw.total_cost     ?? raw.totalCost    ?? 0,
    reason:       raw.reason         ?? 'other',
    reportedBy:   raw.reported_by    ?? raw.reportedBy   ?? '',
    recordedBy:   raw.recorded_by    ?? raw.recordedBy   ?? '',
    notes:        raw.notes          ?? null,
    timestamp:    raw.timestamp      ?? raw.created_at   ?? new Date().toISOString(),
  };
}

// ── Inventory Records ────────────────────────────────────────────────────────

export async function fetchInventory(): Promise<InventoryRecord[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabase
    .from('inventory_records')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('menu_item_id');

  if (error) { console.error('fetchInventory error:', error); return []; }
  return (data || []).map(normalizeInventoryRecord);
}

export async function fetchInventoryById(menuItemId: string): Promise<InventoryRecord> {
  const { data, error } = await supabase
    .from('inventory_records')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .single();

  if (error) throw error;
  return normalizeInventoryRecord(data);
}

export async function createInventoryRecord(record: Partial<InventoryRecord>): Promise<InventoryRecord> {
  const restaurantId = getRestaurantId();
  const id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const stock = Math.round(Number(record.stock) || 0);
  const lowStockThreshold = Math.round(Number(record.lowStockThreshold) || 5);
  const reorderPoint = Math.round(Number(record.reorderPoint) || 10);
  const reorderQty = Math.round(Number(record.reorderQty) || 20);
  const unitCost = toDbDecimal(record.unitCost, 0);
  const qtyStart = Math.round(Number(record.qtyStart ?? record.stock) || stock);
  const price = toDbDecimal(record.price, 0);

  const insertPayload: Record<string, any> = {
    id,
    menu_item_id:        record.menuItemId,
    description:         record.description         ?? '',
    stock,
    low_stock_threshold: lowStockThreshold,
    reorder_point:       reorderPoint,
    reorder_qty:         reorderQty,
    unit_cost:           unitCost,
    supplier_id:         record.supplierId          ?? null,
    location:            record.location            ?? '',
    expiry_date:         record.expiryDate          ?? null,
    purchase_date:       record.purchaseDate        ?? null,
    qty_start:           qtyStart,
    price,
    restaurant_id:       restaurantId,
  };

  const missingColumnPattern = /Could not find the '([^']+)' column of 'inventory_records'/i;
  const postgresMissingColumnPattern = /column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?inventory_records"?\s+does\s+not\s+exist/i;
  let data: any = null;
  let lastError: any = null;
  const mutablePayload = { ...insertPayload };

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await supabase
      .from('inventory_records')
      .insert(mutablePayload)
      .select()
      .single();

    if (!res.error) {
      data = res.data;
      lastError = null;
      break;
    }

    lastError = res.error;
    const msg = String(res.error.message || '');
    const missingCol = msg.match(missingColumnPattern)?.[1] || msg.match(postgresMissingColumnPattern)?.[1];
    if (missingCol && missingCol in mutablePayload) { delete mutablePayload[missingCol]; continue; }
    const intTypeMatch = msg.match(/invalid input syntax for type integer:\s*"?([0-9.]+)"?/i);
    if (intTypeMatch) {
      const badVal = intTypeMatch[1];
      for (const k of Object.keys(mutablePayload)) {
        if (String(mutablePayload[k]) === badVal) { mutablePayload[k] = Math.round(Number(badVal)); break; }
      }
      continue;
    }
    break;
  }

  if (lastError) throw lastError;
  return normalizeInventoryRecord(data);
}

export async function updateInventoryRecord(
  menuItemId: string,
  record: Partial<InventoryRecord> & Record<string, any>
): Promise<InventoryRecord> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) {
    throw new Error('No company selected. Please sign in again or reselect your company.');
  }

  const { data: previous } = await supabase
    .from('inventory_records')
    .select('stock,reorder_point,reorder_qty,supplier_id,unit_cost')
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const newCostValueRaw = record.unitCost ?? record.unit_cost ?? record.cost;
  const hasNewCostValue = newCostValueRaw !== undefined && newCostValueRaw !== null && !Number.isNaN(Number(newCostValueRaw));
  const previousCost = Number(previous?.unit_cost ?? 0);

  // Accept both camelCase (from UI) and snake_case (from direct callers)
  const updateFields: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (record.stock               !== undefined) updateFields.stock               = Math.round(Number(record.stock) || 0);
  if (record.lowStockThreshold   !== undefined) updateFields.low_stock_threshold = Math.round(Number(record.lowStockThreshold) || 5);
  if (record.low_stock_threshold !== undefined) updateFields.low_stock_threshold = Math.round(Number(record.low_stock_threshold) || 5);
  if (record.reorderPoint        !== undefined) updateFields.reorder_point       = Math.round(Number(record.reorderPoint) || 10);
  if (record.reorder_point       !== undefined) updateFields.reorder_point       = Math.round(Number(record.reorder_point) || 10);
  if (record.reorderQty          !== undefined) updateFields.reorder_qty         = Math.round(Number(record.reorderQty) || 20);
  if (record.reorder_qty         !== undefined) updateFields.reorder_qty         = Math.round(Number(record.reorder_qty) || 20);
  if (record.unitCost            !== undefined) updateFields.unit_cost           = toDbDecimal(record.unitCost, 0);
  if (record.unit_cost           !== undefined) updateFields.unit_cost           = toDbDecimal(record.unit_cost, 0);
  if (record.cost                !== undefined) updateFields.unit_cost           = toDbDecimal(record.cost, 0);
  if (record.unitMeasurement    !== undefined) updateFields.unit_measurement   = record.unitMeasurement;
  if (record.unit_measurement !== undefined) updateFields.unit_measurement = record.unit_measurement;
  if (record.supplierId          !== undefined) updateFields.supplier_id         = record.supplierId;
  if (record.supplier_id         !== undefined) updateFields.supplier_id         = record.supplier_id;
  if (record.description         !== undefined) updateFields.description         = record.description;
  if (record.location            !== undefined) updateFields.location            = record.location;
  if (record.expiryDate          !== undefined) updateFields.expiry_date         = record.expiryDate   || null;
  if (record.expiry_date         !== undefined) updateFields.expiry_date         = record.expiry_date  || null;
  if (record.purchaseDate        !== undefined) updateFields.purchase_date       = record.purchaseDate  || null;
  if (record.purchase_date       !== undefined) updateFields.purchase_date       = record.purchase_date || null;
  if (record.qtyStart            !== undefined) updateFields.qty_start           = Math.round(Number(record.qtyStart) || 0);
  if (record.qty_start           !== undefined) updateFields.qty_start           = Math.round(Number(record.qty_start) || 0);
  if (record.price               !== undefined) updateFields.price               = toDbDecimal(record.price, 0);

  // Try UPDATE first (existing record)
  const missingColumnPattern = /Could not find the '([^']+)' column of 'inventory_records'/i;
  const postgresMissingColumnPattern = /column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?inventory_records"?\s+does\s+not\s+exist/i;
  let updated: any[] | null = null;
  let updateError: any = null;
  const mutableUpdateFields: Record<string, any> = { ...updateFields };

  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await supabase
      .from('inventory_records')
      .update(mutableUpdateFields)
      .eq('menu_item_id', menuItemId)
      .eq('restaurant_id', restaurantId)
      .select();

    if (!res.error) {
      updated = res.data || [];
      updateError = null;
      break;
    }

    updateError = res.error;
    const msg = String(res.error.message || '');
    const missingCol = msg.match(missingColumnPattern)?.[1] || msg.match(postgresMissingColumnPattern)?.[1];
    if (missingCol && missingCol in mutableUpdateFields) { delete mutableUpdateFields[missingCol]; continue; }
    const intTypeMatch = msg.match(/invalid input syntax for type integer:\s*"?([0-9.]+)"?/i);
    if (intTypeMatch) {
      const badVal = intTypeMatch[1];
      for (const k of Object.keys(mutableUpdateFields)) {
        if (String(mutableUpdateFields[k]) === badVal) { mutableUpdateFields[k] = Math.round(Number(badVal)); break; }
      }
      continue;
    }
    break;
  }

  if (updateError) {
    throw new Error(`Failed to update inventory record: ${updateError.message}`);
  }

  if (!updateError && updated && updated.length > 0) {
    const normalized = normalizeInventoryRecord(updated[0]);
    if (hasNewCostValue) {
      await recordCostChangeAudit({
        menuItemId,
        restaurantId,
        performedBy: getStaffId(),
        oldCost: previousCost,
        newCost: Number(newCostValueRaw),
        stockBefore: Number(previous?.stock ?? updated[0]?.stock ?? 0),
        stockAfter: Number(updated[0]?.stock ?? 0),
      });
    }
    await maybeAutoReorder({
      menuItemId,
      restaurantId,
      previous,
      current: updated[0],
      overrideSupplierId: record.supplierId ?? record.supplier_id,
      overrideUnitCost: record.unitCost ?? record.unit_cost,
    });
    return normalized;
  }

  // No existing row — INSERT with a generated id
  const id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const stock = Math.round(Number(record.stock) || 0);
  const lowStockThreshold = Math.round(Number(record.lowStockThreshold ?? record.low_stock_threshold) || 5);
  const reorderPoint = Math.round(Number(record.reorderPoint ?? record.reorder_point) || 10);
  const reorderQty = Math.round(Number(record.reorderQty ?? record.reorder_qty) || 20);
  const unitCost = toDbDecimal(record.unitCost ?? record.unit_cost, 0);
  const qtyStart = Math.round(Number(record.qtyStart ?? record.qty_start ?? record.stock) || stock);
  const price = toDbDecimal(record.price, 0);
  const insertPayload: Record<string, any> = {
    id,
    menu_item_id:        menuItemId,
    restaurant_id:       restaurantId,
    description:         record.description         ?? '',
    stock,
    low_stock_threshold: lowStockThreshold,
    reorder_point:       reorderPoint,
    reorder_qty:         reorderQty,
    unit_cost:           unitCost,
    supplier_id:         record.supplierId          ?? record.supplier_id         ?? null,
    location:            record.location            ?? '',
    expiry_date:         record.expiryDate          ?? record.expiry_date         ?? null,
    purchase_date:       record.purchaseDate        ?? record.purchase_date       ?? null,
    qty_start:           qtyStart,
    price,
    updated_at:          new Date().toISOString(),
  };

  let data: any = null;
  let error: any = null;
  const mutableInsertPayload = { ...insertPayload };

  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await supabase
      .from('inventory_records')
      .insert(mutableInsertPayload)
      .select()
      .single();

    if (!res.error) {
      data = res.data;
      error = null;
      break;
    }

    error = res.error;
    const msg = String(res.error.message || '');
    const missingCol = msg.match(missingColumnPattern)?.[1] || msg.match(postgresMissingColumnPattern)?.[1];
    if (missingCol && missingCol in mutableInsertPayload) { delete mutableInsertPayload[missingCol]; continue; }
    const intTypeMatch = msg.match(/invalid input syntax for type integer:\s*"?([0-9.]+)"?/i);
    if (intTypeMatch) {
      const badVal = intTypeMatch[1];
      for (const k of Object.keys(mutableInsertPayload)) {
        if (String(mutableInsertPayload[k]) === badVal) { mutableInsertPayload[k] = Math.round(Number(badVal)); break; }
      }
      continue;
    }
    break;
  }

  if (error) {
    throw new Error(`Failed to insert inventory record: ${error.message}`);
  }
  await maybeAutoReorder({
    menuItemId,
    restaurantId,
    previous,
    current: data,
    overrideSupplierId: record.supplierId ?? record.supplier_id,
    overrideUnitCost: record.unitCost ?? record.unit_cost,
  });
  return normalizeInventoryRecord(data);
}

export async function relinkInventoryRecord(
  oldMenuItemId: string,
  newMenuItemId: string,
): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const { error } = await supabase
    .from('inventory_records')
    .update({ menu_item_id: newMenuItemId, updated_at: new Date().toISOString() })
    .eq('menu_item_id', oldMenuItemId)
    .eq('restaurant_id', restaurantId);

  if (error) throw new Error(`Failed to relink inventory record: ${error.message}`);
}

async function maybeAutoReorder(params: {
  menuItemId: string;
  restaurantId: string;
  previous: any;
  current: any;
  overrideSupplierId?: string;
  overrideUnitCost?: number;
}): Promise<void> {
  const previousStock = Number(params.previous?.stock ?? NaN);
  const currentStock = Number(params.current?.stock ?? 0);
  const reorderPoint = Number(params.current?.reorder_point ?? params.current?.reorderPoint ?? params.previous?.reorder_point ?? 0);
  const reorderQty = Number(params.current?.reorder_qty ?? params.current?.reorderQty ?? params.previous?.reorder_qty ?? 0);
  const supplierId = (params.overrideSupplierId || params.current?.supplier_id || params.current?.supplierId || params.previous?.supplier_id || '').trim();

  if (!supplierId || reorderPoint <= 0 || reorderQty <= 0) return;

  // Trigger only on threshold crossing to avoid duplicate orders on every save.
  const crossedThreshold = Number.isFinite(previousStock)
    ? previousStock > reorderPoint && currentStock <= reorderPoint
    : currentStock <= reorderPoint;
  if (!crossedThreshold) return;

  const { data: existingOpen, error: existingError } = await supabase
    .from('purchase_orders')
    .select('id, items, status')
    .eq('restaurant_id', params.restaurantId)
    .eq('supplier_id', supplierId)
    .in('status', ['draft', 'sent', 'confirmed', 'shipped', 'partial'])
    .order('created_at', { ascending: false })
    .limit(25);

  if (!existingError && Array.isArray(existingOpen)) {
    const alreadyQueued = existingOpen.some((po: any) => {
      const items = Array.isArray(po.items) ? po.items : [];
      return items.some((item: any) => (item.menu_item_id || item.menuItemId) === params.menuItemId);
    });
    if (alreadyQueued) return;
  }

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('name')
    .eq('id', supplierId)
    .maybeSingle();
  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('name')
    .eq('id', params.menuItemId)
    .maybeSingle();

  const supplierName = supplier?.name || 'Supplier';
  const itemName = menuItem?.name || params.menuItemId;
  const unitCost = Number(params.overrideUnitCost ?? params.current?.unit_cost ?? params.current?.unitCost ?? params.previous?.unit_cost ?? 0);

  try {
    await createPurchaseOrder({
      supplierId,
      supplierName,
      items: [{
        menuItemId: params.menuItemId,
        menuItemName: itemName,
        orderedQty: reorderQty,
        receivedQty: 0,
        unitCost,
        totalCost: reorderQty * unitCost,
      }],
      totalCost: reorderQty * unitCost,
      notes: `Auto reorder triggered at stock ${currentStock} (reorder point ${reorderPoint}).`,
      createdBy: getStaffId(),
    });
  } catch (err) {
    console.warn('Auto reorder trigger failed:', err);
  }
}

export async function deleteInventoryRecord(menuItemId: string): Promise<void> {
  const restaurantId = getRestaurantId();
  // Build query — only add restaurant_id filter when it's available (undefined breaks the eq filter)
  let deleteQuery = supabase
    .from('inventory_records')
    .delete()
    .eq('menu_item_id', menuItemId);

  if (restaurantId) {
    deleteQuery = deleteQuery.eq('restaurant_id', restaurantId);
  }

  const { error } = await deleteQuery;
  if (error) throw error;
}

/**
 * Decrements inventory stock for each item in an order.
 * Called after a successful order creation.
 * Failures are logged but do NOT throw — order creation takes priority over inventory sync.
 */
export async function decrementInventoryForOrder(
  items: Array<{ menuItemId: string; quantity: number }>,
  options?: { reference?: string; performedBy?: string }
): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId || !items.length) return;
  const performedBy = options?.performedBy || getStaffId();

  await Promise.allSettled(
    items.map(async ({ menuItemId, quantity }) => {
      const { data: rec, error: fetchErr } = await supabase
        .from('inventory_records')
        .select('stock')
        .eq('menu_item_id', menuItemId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (fetchErr || !rec) return; // No inventory record for this item — skip silently

      const newStock = Math.max(0, (rec.stock ?? 0) - quantity);
      const { error: updateErr } = await supabase
        .from('inventory_records')
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq('menu_item_id', menuItemId)
        .eq('restaurant_id', restaurantId);

      if (updateErr) {
        console.warn(`[decrementInventoryForOrder] Failed to decrement stock for ${menuItemId}:`, updateErr.message);
        return;
      }

      const { error: movementErr } = await supabase
        .from('stock_movements')
        .insert({
          id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          menu_item_id: menuItemId,
          menu_item_name: menuItemId,
          type: 'sale',
          qty: -Math.abs(quantity),
          stock_before: rec.stock ?? 0,
          balance_after: newStock,
          performed_by: performedBy,
          reference: options?.reference ?? null,
          notes: options?.reference ? `Sale for ${options.reference}` : 'Sale inventory deduction',
          restaurant_id: restaurantId,
        });

      if (movementErr) {
        console.warn(`[decrementInventoryForOrder] Failed to log movement for ${menuItemId}:`, movementErr.message);
      }
    })
  );
}

export async function fetchLowStockItems(): Promise<InventoryRecord[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  // Fetch all and filter client-side (supabase.raw() not supported in JS client)
  const { data, error } = await supabase
    .from('inventory_records')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('stock', { ascending: true });

  if (error) { console.error('fetchLowStockItems error:', error); return []; }
  const records = (data || []).map(normalizeInventoryRecord);
  return records.filter(r => r.stock <= r.lowStockThreshold);
}

export async function adjustStock(
  menuItemId: string,
  adjustment: number,
  reason: string,
  performedBy: string
): Promise<InventoryRecord> {
  const restaurantId = getRestaurantId();

  const { data: current } = await supabase
    .from('inventory_records')
    .select('stock')
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .single();

  const oldStock = current?.stock ?? 0;
  const newStock = Math.max(0, oldStock + adjustment);

  const { data, error } = await supabase
    .from('inventory_records')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) throw error;

  const { error: movementError } = await supabase.from('stock_movements').insert({
    id:            `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    menu_item_id:  menuItemId,
    menu_item_name: menuItemId,
    type:          adjustment > 0 ? 'purchase' : 'adjustment',
    qty:           Math.abs(adjustment),
    stock_before:  oldStock,
    balance_after: newStock,
    performed_by:  performedBy,
    notes:         reason,
    restaurant_id: restaurantId,
  });
  if (movementError) {
    console.warn('Failed to record stock movement:', movementError);
  }

  return normalizeInventoryRecord(data);
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function fetchSuppliers(): Promise<Supplier[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];
  console.log('Fetching suppliers for restaurant:', restaurantId);

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) { console.error('fetchSuppliers error:', error); return []; }
  console.log('Suppliers fetched:', data);
  return (data || []).map(normalizeSupplier);
}

export async function createSupplier(supplier: Partial<Supplier>): Promise<Supplier> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');
  
  const id = `sup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log('Creating supplier:', supplier, 'restaurant:', restaurantId);

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      id,
      name:           supplier.name,
      contact_person: supplier.contactPerson  ?? '',
      email:          supplier.email          ?? '',
      phone:          supplier.phone          ?? '',
      address:        supplier.address        ?? '',
      categories:     supplier.categories     ?? [],
      lead_time_days: supplier.leadTimeDays   ?? 7,
      payment_terms:  supplier.paymentTerms   ?? 'Net 30',
      rating:         supplier.rating         ?? 3,
      is_active:      supplier.isActive       !== false,
      notes:          supplier.notes          ?? '',
      restaurant_id:  restaurantId,
    })
    .select()
    .single();

  if (error) {
    console.error('createSupplier error:', error);
    throw error;
  }
  console.log('Supplier created:', data);
  return normalizeSupplier(data);
}

export async function updateSupplier(id: string, supplier: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name:           supplier.name,
      contact_person: supplier.contactPerson,
      email:          supplier.email,
      phone:          supplier.phone,
      address:        supplier.address,
      categories:     supplier.categories,
      lead_time_days: supplier.leadTimeDays,
      payment_terms:  supplier.paymentTerms,
      rating:         supplier.rating,
      is_active:      supplier.isActive,
      notes:          supplier.notes,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalizeSupplier(data);
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
}

// ── Purchase Orders ──────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  let query = supabase
    .from('purchase_orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status.toLowerCase());

  const { data, error } = await query;
  if (error) { console.error('fetchPurchaseOrders error:', error); return []; }
  return (data || []).map(normalizePurchaseOrder);
}

export async function createPurchaseOrder(po: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const dbItems = (po.items || []).map(i => ({
    menu_item_id:   i.menuItemId,
    menu_item_name: i.menuItemName,
    ordered_qty:    i.orderedQty,
    received_qty:   i.receivedQty ?? 0,
    unit_cost:      i.unitCost,
    total_cost:     i.totalCost,
  }));

  // Primary path: backend route emits supplier real-time notifications.
  try {
    return await apiRequest<PurchaseOrder>(`${API_BASE}/purchase-orders`, {
      method: 'POST',
      json: {
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        items: (po.items || []).map((i) => ({
          menuItemId: i.menuItemId,
          menuItemName: i.menuItemName,
          orderedQty: i.orderedQty,
          receivedQty: i.receivedQty ?? 0,
          unitCost: i.unitCost,
          totalCost: i.totalCost,
        })),
        totalCost: po.totalCost ?? 0,
        expectedDelivery: po.expectedDelivery ?? null,
        notes: po.notes ?? null,
        createdBy: po.createdBy || getStaffId(),
        restaurantId,
      },
    });
  } catch (apiErr) {
    console.warn('Backend purchase order API failed, falling back to direct insert:', apiErr);
  }

  const id = `po-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      id,
      supplier_id:       po.supplierId,
      supplier_name:     po.supplierName,
      status:            'sent',
      items:             dbItems,
      total_cost:        po.totalCost      ?? 0,
      expected_delivery: po.expectedDelivery ?? null,
      notes:             po.notes           ?? null,
      created_by:        po.createdBy       || getStaffId(),
      restaurant_id:     restaurantId,
    })
    .select()
    .single();

  if (error) throw error;
  return normalizePurchaseOrder(data);
}

export async function updatePurchaseOrder(id: string, po: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const dbItems = po.items ? po.items.map(i => ({
    menu_item_id:   i.menuItemId,
    menu_item_name: i.menuItemName,
    ordered_qty:    i.orderedQty,
    received_qty:   i.receivedQty ?? 0,
    unit_cost:      i.unitCost,
    total_cost:     i.totalCost,
  })) : undefined;

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (po.status            !== undefined) update.status            = po.status;
  if (po.supplierId        !== undefined) update.supplier_id       = po.supplierId;
  if (po.supplierName      !== undefined) update.supplier_name     = po.supplierName;
  if (dbItems              !== undefined) update.items             = dbItems;
  if (po.totalCost         !== undefined) update.total_cost        = po.totalCost;
  if (po.expectedDelivery  !== undefined) update.expected_delivery = po.expectedDelivery;
  if (po.notes             !== undefined) update.notes             = po.notes;

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalizePurchaseOrder(data);
}

export async function receivePurchaseOrder(
  id: string,
  receivedItems: { menu_item_id: string; received_qty: number }[],
  receivedBy: string
): Promise<PurchaseOrder> {
  const restaurantId = getRestaurantId();

  // Update inventory stock for each received item
  for (const item of receivedItems) {
    if (!item.received_qty || item.received_qty <= 0) continue;

    // Use supabase so RLS never blocks the fetch — same client used for the write below
    let fetchQuery = supabase
      .from('inventory_records')
      .select('stock')
      .eq('menu_item_id', item.menu_item_id);
    if (restaurantId) fetchQuery = fetchQuery.eq('restaurant_id', restaurantId);

    const { data: inv } = await fetchQuery.maybeSingle();

    const oldStock = inv?.stock ?? 0;
    const newStock = oldStock + item.received_qty;

    if (inv) {
      // Existing record — update stock in place
      let updateQuery = supabase
        .from('inventory_records')
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq('menu_item_id', item.menu_item_id);
      if (restaurantId) updateQuery = updateQuery.eq('restaurant_id', restaurantId);
      await updateQuery;
    } else {
      // No record yet — insert with generated id
      await supabase
        .from('inventory_records')
        .insert({
          id:                  `inv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          menu_item_id:        item.menu_item_id,
          stock:               newStock,
          restaurant_id:       restaurantId,
          low_stock_threshold: 5,
          reorder_point:       10,
          reorder_qty:         20,
          unit_cost:           0,
          updated_at:          new Date().toISOString(),
        });
    }

    // Record the movement
    const { error: movementError } = await supabase.from('stock_movements').insert({
      id:            `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      menu_item_id:  item.menu_item_id,
      menu_item_name: item.menu_item_id,
      type:          'purchase',
      qty:           item.received_qty,
      stock_before:  oldStock,
      balance_after: newStock,
      performed_by:  receivedBy,
      reference:     `PO:${id}`,
      restaurant_id: restaurantId,
    });
    if (movementError) {
      console.warn('Failed to record stock movement for received PO item:', movementError);
    }
  }

  // Mark PO as received
  const { data, error } = await supabase
    .from('purchase_orders')
    .update({
      status:      'received',
      received_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return normalizePurchaseOrder(data);
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
  if (error) throw error;
}

// ── Stock Movements ──────────────────────────────────────────────────────────

export async function fetchMovements(filters?: {
  menu_item_id?: string;
  type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  let query = supabase
    .from('stock_movements')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('timestamp', { ascending: false });

  if (filters?.menu_item_id) query = query.eq('menu_item_id', filters.menu_item_id);
  if (filters?.type)         query = query.eq('type', filters.type);
  if (filters?.from_date)    query = query.gte('timestamp', filters.from_date);
  if (filters?.to_date)      query = query.lte('timestamp', filters.to_date);
  if (filters?.limit)        query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) { console.error('fetchMovements error:', error); return []; }
  return (data || []).map(normalizeMovement);
}

/**
 * Convenience wrapper: fetch all stock movements for a single item, newest first.
 * Includes cost-change audit entries (reference = 'COST_CHANGE').
 */
export async function fetchItemMovements(menuItemId: string, limit = 100): Promise<StockMovement[]> {
  return fetchMovements({ menu_item_id: menuItemId, limit });
}

// ── Waste Entries ────────────────────────────────────────────────────────────

export async function fetchWasteEntries(filters?: {
  menu_item_id?: string;
  reason?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<WasteEntry[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  let query = supabase
    .from('waste_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('timestamp', { ascending: false });

  if (filters?.menu_item_id) query = query.eq('menu_item_id', filters.menu_item_id);
  if (filters?.reason)       query = query.eq('reason', filters.reason);
  if (filters?.from_date)    query = query.gte('timestamp', filters.from_date);
  if (filters?.to_date)      query = query.lte('timestamp', filters.to_date);
  if (filters?.limit)        query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) { console.error('fetchWasteEntries error:', error); return []; }
  return (data || []).map(normalizeWasteEntry);
}

export async function recordWaste(waste: {
  menu_item_id: string;
  menu_item_name: string;
  qty: number;
  unit_cost: number;
  reason: string;
  reported_by: string;
  recorded_by: string;
  notes?: string;
}): Promise<WasteEntry> {
  const restaurantId = getRestaurantId();
  const id = `waste-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const { data: inv } = await supabase
    .from('inventory_records')
    .select('stock')
    .eq('menu_item_id', waste.menu_item_id)
    .eq('restaurant_id', restaurantId)
    .single();

  const oldStock = inv?.stock ?? 0;
  const newStock = Math.max(0, oldStock - waste.qty);

  await supabase
    .from('inventory_records')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('menu_item_id', waste.menu_item_id)
    .eq('restaurant_id', restaurantId);

  const { data, error } = await supabase
    .from('waste_entries')
    .insert({
      id,
      menu_item_id:   waste.menu_item_id,
      menu_item_name: waste.menu_item_name,
      qty:            waste.qty,
      unit_cost:      waste.unit_cost,
      total_cost:     waste.qty * waste.unit_cost,
      reason:         waste.reason,
      reported_by:    waste.reported_by,
      recorded_by:    waste.recorded_by,
      notes:          waste.notes ?? null,
      restaurant_id:  restaurantId,
    })
    .select()
    .single();

  if (error) throw error;
  return normalizeWasteEntry(data);
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function computeInventoryAnalytics(): Promise<InventoryAnalytics> {
  const [inventory, _movements, waste, pos] = await Promise.all([
    fetchInventory(),
    fetchMovements({ limit: 200 }),
    fetchWasteEntries({ limit: 200 }),
    fetchPurchaseOrders(),
  ]);

  const totalStockValue   = inventory.reduce((s, r) => s + r.stock * r.unitCost, 0);
  const outOfStockCount   = inventory.filter(r => r.stock === 0).length;
  const lowStockCount     = inventory.filter(r => r.stock > 0 && r.stock <= r.lowStockThreshold).length;
  const belowReorderCount = inventory.filter(r => r.stock <= r.reorderPoint).length;

  const pendingPO      = pos.filter(p => !['received', 'cancelled'].includes(p.status));
  const pendingPOCount = pendingPO.length;
  const pendingPOValue = pendingPO.reduce((s, p) => s + p.totalCost, 0);

  const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentWaste    = waste.filter(w => w.timestamp >= thirtyDaysAgo);
  const wasteCostLast30d = recentWaste.reduce((s, w) => s + w.totalCost, 0);

  const wasteByReasonMap = new Map<string, { qty: number; cost: number }>();
  recentWaste.forEach(w => {
    const e = wasteByReasonMap.get(w.reason) || { qty: 0, cost: 0 };
    e.qty += w.qty; e.cost += w.totalCost;
    wasteByReasonMap.set(w.reason, e);
  });
  const wasteByReason = Array.from(wasteByReasonMap.entries()).map(([reason, d]) => ({ reason, ...d }));
  const topWasteReason = wasteByReason.length > 0
    ? wasteByReason.sort((a, b) => b.cost - a.cost)[0].reason
    : null;

  return {
    totalStockValue,
    lowStockCount,
    outOfStockCount,
    pendingPOCount,
    pendingPOValue,
    wasteCostLast30d,
    avgTurnoverDays: 30,
    belowReorderCount,
    topWasteReason,
    wasteByReason,
    topWasteItems: [],
    stockTurnoverRate: 1,
    categoryBreakdown: [],
  };
}

// ── Locations / Forecasting ───────────────────────────────────────────────────

function normalizeLocation(raw: any): InventoryLocation {
  return {
    id: raw.id,
    restaurantId: raw.restaurant_id ?? raw.restaurantId ?? '',
    name: raw.name ?? '',
    type: raw.type ?? 'other',
    description: raw.description ?? undefined,
    isActive: raw.is_active ?? raw.isActive ?? true,
    capacity: raw.capacity ?? undefined,
    temperatureRange: raw.temperature_range ?? raw.temperatureRange ?? undefined,
    totalItems: Number(raw.total_items ?? raw.totalItems ?? 0),
    totalStock: Number(raw.total_stock ?? raw.totalStock ?? 0),
    lowStockItems: Number(raw.low_stock_items ?? raw.lowStockItems ?? 0),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
  };
}

function isMissingLocationsTableError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : String((error as any)?.message ?? error ?? '');
  const msg = message.toLowerCase();
  return (
    msg.includes('inventory_locations') &&
    (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('42p01'))
  );
}

function locationFallbackStorageKey(restaurantId: string): string {
  return `inventory_locations_fallback:${restaurantId}`;
}

function getFallbackLocationsFromStorage(restaurantId: string): InventoryLocation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(locationFallbackStorageKey(restaurantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeLocation) : [];
  } catch {
    return [];
  }
}

function saveFallbackLocationToStorage(restaurantId: string, location: InventoryLocation): void {
  if (typeof window === 'undefined') return;
  const existing = getFallbackLocationsFromStorage(restaurantId);
  const next = [
    ...existing.filter((l) => l.id !== location.id && l.name.toLowerCase() !== location.name.toLowerCase()),
    location,
  ];
  localStorage.setItem(locationFallbackStorageKey(restaurantId), JSON.stringify(next));
}

function inferLocationsFromInventoryRecords(
  inventory: InventoryRecord[],
  restaurantId: string
): InventoryLocation[] {
  const byName = new Map<string, { name: string; totalItems: number; totalStock: number; lowStockItems: number }>();
  for (const rec of inventory) {
    const name = String(rec.location || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const current = byName.get(key) || { name, totalItems: 0, totalStock: 0, lowStockItems: 0 };
    current.totalItems += 1;
    current.totalStock += Number(rec.stock || 0);
    if (rec.stock <= rec.lowStockThreshold) current.lowStockItems += 1;
    byName.set(key, current);
  }

  return Array.from(byName.values()).map((entry) => {
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'location';
    return normalizeLocation({
      id: `loc-fallback-${slug}`,
      restaurant_id: restaurantId,
      name: entry.name,
      type: 'other',
      is_active: true,
      total_items: entry.totalItems,
      total_stock: entry.totalStock,
      low_stock_items: entry.lowStockItems,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });
}

function normalizeForecast(raw: any): InventoryForecast {
  return {
    id: raw.id,
    menuItemId: raw.menu_item_id ?? raw.menuItemId ?? '',
    menuItemName: raw.menu_item_name ?? raw.menuItemName ?? '',
    forecastDate: raw.forecast_date ?? raw.forecastDate ?? new Date().toISOString().split('T')[0],
    predictedConsumption: Number(raw.predicted_consumption ?? raw.predictedConsumption ?? 0),
    confidenceLevel: Number(raw.confidence_level ?? raw.confidenceLevel ?? 0),
    recommendedReorderQty: Number(raw.recommended_reorder_qty ?? raw.recommendedReorderQty ?? 0),
    leadTimeDays: Number(raw.lead_time_days ?? raw.leadTimeDays ?? 0),
    seasonalityFactor: Number(raw.seasonality_factor ?? raw.seasonalityFactor ?? 1),
    trendFactor: Number(raw.trend_factor ?? raw.trendFactor ?? 1),
    lastStockLevel: Number(raw.last_stock_level ?? raw.lastStockLevel ?? 0),
    daysUntilStockout: Number(raw.days_until_stockout ?? raw.daysUntilStockout ?? 0),
    alertStatus: raw.alert_status ?? raw.alertStatus ?? 'none',
  };
}

export async function fetchLocations(): Promise<InventoryLocation[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  try {
    const payload = await apiRequest<any[]>('/locations');
    if (Array.isArray(payload)) {
      return payload.map(normalizeLocation);
    }
  } catch (apiErr) {
    console.warn('fetchLocations backend endpoint unavailable, using Supabase fallback.');
  }

  try {
    const { data, error } = await supabase
      .from('inventory_locations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    const inventory = await fetchInventory();
    const byLocation = new Map<string, { totalItems: number; totalStock: number; lowStockItems: number }>();
    inventory.forEach((rec) => {
      const key = (rec.location || '').trim().toLowerCase();
      if (!key) return;
      const stats = byLocation.get(key) || { totalItems: 0, totalStock: 0, lowStockItems: 0 };
      stats.totalItems += 1;
      stats.totalStock += rec.stock;
      if (rec.stock <= rec.lowStockThreshold) stats.lowStockItems += 1;
      byLocation.set(key, stats);
    });

    return (data || []).map((row: any) => {
      const fallbackStats = byLocation.get(String(row.name || '').trim().toLowerCase()) || {
        totalItems: 0,
        totalStock: 0,
        lowStockItems: 0,
      };
      return normalizeLocation({
        ...row,
        total_items: row.total_items ?? fallbackStats.totalItems,
        total_stock: row.total_stock ?? fallbackStats.totalStock,
        low_stock_items: row.low_stock_items ?? fallbackStats.lowStockItems,
      });
    });
  } catch (error) {
    const inventory = await fetchInventory().catch(() => [] as InventoryRecord[]);
    const inferred = inferLocationsFromInventoryRecords(inventory, restaurantId);
    const stored = getFallbackLocationsFromStorage(restaurantId);
    const merged = new Map<string, InventoryLocation>();
    [...inferred, ...stored].forEach((loc) => merged.set(`${loc.id}:${loc.name.toLowerCase()}`, loc));

    if (isMissingLocationsTableError(error)) {
      console.warn('inventory_locations table missing; using derived fallback locations.');
      return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    console.warn('fetchLocations fallback unavailable, returning derived list only.');
    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export async function createLocation(payload: {
  name: string;
  type: InventoryLocation['type'];
  description?: string;
  capacity?: number;
  temperatureRange?: string;
}): Promise<InventoryLocation> {
  try {
    const created = await apiRequest<any>('/locations', {
      method: 'POST',
      json: payload,
    });
    return normalizeLocation(created);
  } catch (apiErr) {
    const apiMessage = apiErr instanceof Error ? apiErr.message : (apiErr && typeof apiErr === 'object' && 'message' in apiErr ? String((apiErr as any).message) : 'Backend location endpoint failed');
    const restaurantId = getRestaurantId();
    if (!restaurantId) throw new Error('No company selected');

    const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { data, error } = await supabase
      .from('inventory_locations')
      .insert({
        id,
        restaurant_id: restaurantId,
        name: payload.name,
        type: payload.type,
        description: payload.description ?? null,
        capacity: payload.capacity ?? null,
        temperature_range: payload.temperatureRange ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (isMissingLocationsTableError(error)) {
        const now = new Date().toISOString();
        const location = normalizeLocation({
          id,
          restaurant_id: restaurantId,
          name: payload.name,
          type: payload.type,
          description: payload.description ?? null,
          capacity: payload.capacity ?? null,
          temperature_range: payload.temperatureRange ?? null,
          is_active: true,
          total_items: 0,
          total_stock: 0,
          low_stock_items: 0,
          created_at: now,
          updated_at: now,
        });
        saveFallbackLocationToStorage(restaurantId, location);
        return location;
      }
      throw new Error(`Location create failed. API: ${apiMessage}. Fallback: ${error.message || 'Unknown database error'}`);
    }
    return normalizeLocation(data);
  }
}

export async function updateLocation(
  id: string,
  payload: {
    name?: string;
    type?: InventoryLocation['type'];
    description?: string;
    capacity?: number;
    temperatureRange?: string;
    isActive?: boolean;
  }
): Promise<InventoryLocation> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  // Fallback IDs are client-side only — skip the API and update localStorage directly
  if (id.startsWith('loc-fallback-')) {
    const existing = getFallbackLocationsFromStorage(restaurantId);
    const target = existing.find((l) => l.id === id);
    if (!target) throw new Error(`Location ${id} not found in fallback storage`);
    const updated = normalizeLocation({ ...target, ...payload, id });
    saveFallbackLocationToStorage(restaurantId, updated);
    return updated;
  }

  try {
    const updated = await apiRequest<any>(`/locations/${id}`, {
      method: 'PUT',
      json: payload,
    });
    return normalizeLocation(updated);
  } catch {
    const dbPayload: Record<string, any> = {};
    if (payload.name !== undefined)            dbPayload.name              = payload.name;
    if (payload.type !== undefined)            dbPayload.type              = payload.type;
    if (payload.description !== undefined)     dbPayload.description       = payload.description ?? null;
    if (payload.capacity !== undefined)        dbPayload.capacity          = payload.capacity ?? null;
    if (payload.temperatureRange !== undefined) dbPayload.temperature_range = payload.temperatureRange ?? null;
    if (payload.isActive !== undefined)        dbPayload.is_active         = payload.isActive;
    dbPayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('inventory_locations')
      .update(dbPayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // If table missing, mutate the localStorage fallback
      if (isMissingLocationsTableError(error)) {
        const existing = getFallbackLocationsFromStorage(restaurantId);
        const target = existing.find((l) => l.id === id);
        if (!target) throw new Error(`Location ${id} not found in fallback storage`);
        const updated = normalizeLocation({ ...target, ...payload, id });
        saveFallbackLocationToStorage(restaurantId, updated);
        return updated;
      }
      throw new Error(error.message);
    }
    return normalizeLocation(data);
  }
}

export async function deleteLocation(id: string): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  // Fallback IDs are client-side only — remove from localStorage directly
  if (id.startsWith('loc-fallback-')) {
    const existing = getFallbackLocationsFromStorage(restaurantId);
    const next = existing.filter((l) => l.id !== id);
    localStorage.setItem(locationFallbackStorageKey(restaurantId), JSON.stringify(next));
    return;
  }

  try {
    await apiRequest<void>(`/locations/${id}`, { method: 'DELETE' });
    return;
  } catch {
    const { error } = await supabase
      .from('inventory_locations')
      .delete()
      .eq('id', id);

    if (error) {
      if (isMissingLocationsTableError(error)) {
        const existing = getFallbackLocationsFromStorage(restaurantId);
        const next = existing.filter((l) => l.id !== id);
        localStorage.setItem(locationFallbackStorageKey(restaurantId), JSON.stringify(next));
        return;
      }
      throw new Error(error.message);
    }
  }
}

type ForecastGenerateResponse = {
  success: boolean;
  count: number;
  forecasts: any[];
};

function computeClientSideForecasts(
  inventoryRecords: InventoryRecord[],
  menuById: Map<string, string> = new Map()
): InventoryForecast[] {
  const today = new Date().toISOString().split('T')[0];
  return inventoryRecords
    .filter((r) => r.menuItemId)
    .map((r): InventoryForecast => {
      // Estimate daily consumption: assume stock turns over in ~14 days from reorder point
      const estimatedDailyConsumption = Math.max(1, Math.round(r.reorderPoint / 14));
      const daysUntilStockout =
        r.stock > 0 ? Math.floor(r.stock / estimatedDailyConsumption) : 0;
      const recommendedReorderQty = Math.max(r.reorderQty, estimatedDailyConsumption * 14);

      let alertStatus: 'none' | 'warning' | 'critical' = 'none';
      if (daysUntilStockout <= 2 || r.stock === 0) {
        alertStatus = 'critical';
      } else if (daysUntilStockout <= 5 || r.stock <= r.lowStockThreshold) {
        alertStatus = 'warning';
      }

      return {
        id: `local_${r.menuItemId}`,
        menuItemId: r.menuItemId,
        menuItemName: menuById.get(r.menuItemId) || r.menuItemId,
        forecastDate: today,
        predictedConsumption: estimatedDailyConsumption,
        confidenceLevel: 0.5,
        recommendedReorderQty,
        leadTimeDays: 3,
        seasonalityFactor: 1,
        trendFactor: 1,
        lastStockLevel: r.stock,
        daysUntilStockout,
        alertStatus,
      };
    })
    .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
}

export async function fetchForecasts(): Promise<InventoryForecast[]> {
  try {
    const forecasts = await apiRequest<any[]>('/forecasting');
    return Array.isArray(forecasts) ? forecasts.map(normalizeForecast) : [];
  } catch {
    // Backend unavailable — fall through to client-side computation
  }

  try {
    if (!getRestaurantId()) return [];

    const [inventoryRecords, menuItems] = await Promise.allSettled([
      fetchInventory(),
      import('./menu').then((m) => m.fetchMenu()),
    ]);

    const inv = inventoryRecords.status === 'fulfilled' ? inventoryRecords.value : [];
    const menuById = new Map<string, string>(
      menuItems.status === 'fulfilled'
        ? menuItems.value.map((mi: any) => [mi.id, mi.name] as [string, string])
        : []
    );

    return computeClientSideForecasts(inv, menuById);
  } catch {
    return [];
  }
}

export async function generateForecasts() {
  try {
    const payload = await apiRequest<ForecastGenerateResponse>('/forecasting/generate', {
      method: 'POST',
    });

    return {
      success: Boolean(payload?.success),
      count: Number(payload?.count || 0),
      forecasts: Array.isArray(payload?.forecasts) ? payload.forecasts.map(normalizeForecast) : [],
    };
  } catch (error) {
    const existing = await fetchForecasts();
    return {
      success: existing.length > 0,
      count: existing.length,
      forecasts: existing,
    };
  }
}

export async function fetchForecastAlerts(): Promise<InventoryForecast[]> {
  try {
    const alerts = await apiRequest<any[]>('/forecasting/alerts');
    return Array.isArray(alerts) ? alerts.map(normalizeForecast) : [];
  } catch (error) {
    const forecasts = await fetchForecasts();
    return forecasts.filter((f) => f.alertStatus === 'critical' || f.alertStatus === 'warning');
  }
}

