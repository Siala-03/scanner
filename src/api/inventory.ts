import { supabase, supabaseAdmin } from '../lib/supabase';
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
import { apiRequest } from './http';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

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

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeInventoryRecord(raw: any): InventoryRecord {
  return {
    menuItemId:        raw.menu_item_id   ?? raw.menuItemId   ?? '',
    stock:             raw.stock           ?? 0,
    lowStockThreshold: raw.low_stock_threshold ?? raw.lowStockThreshold ?? 5,
    reorderPoint:      raw.reorder_point   ?? raw.reorderPoint ?? 10,
    reorderQty:        raw.reorder_qty     ?? raw.reorderQty   ?? 20,
    unitCost:          raw.unit_cost       ?? raw.unitCost     ?? 0,
    supplierId:        raw.supplier_id     ?? raw.supplierId   ?? undefined,
    location:          raw.location        ?? '',
    updatedAt:         raw.updated_at      ?? raw.updatedAt    ?? new Date().toISOString(),
  };
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

  const { data, error } = await supabaseAdmin
    .from('inventory_records')
    .insert({
      id,
      menu_item_id:        record.menuItemId,
      stock:               record.stock               ?? 0,
      low_stock_threshold: record.lowStockThreshold   ?? 5,
      reorder_point:       record.reorderPoint        ?? 10,
      reorder_qty:         record.reorderQty          ?? 20,
      unit_cost:           record.unitCost            ?? 0,
      supplier_id:         record.supplierId          ?? null,
      location:            record.location            ?? '',
      restaurant_id:       restaurantId,
    })
    .select()
    .single();

  if (error) throw error;
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

  const { data: previous } = await supabaseAdmin
    .from('inventory_records')
    .select('stock,reorder_point,reorder_qty,supplier_id,unit_cost')
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  // Accept both camelCase (from UI) and snake_case (from direct callers)
  const updateFields: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (record.stock               !== undefined) updateFields.stock               = record.stock;
  if (record.lowStockThreshold   !== undefined) updateFields.low_stock_threshold = record.lowStockThreshold;
  if (record.low_stock_threshold !== undefined) updateFields.low_stock_threshold = record.low_stock_threshold;
  if (record.reorderPoint        !== undefined) updateFields.reorder_point       = record.reorderPoint;
  if (record.reorder_point       !== undefined) updateFields.reorder_point       = record.reorder_point;
  if (record.reorderQty          !== undefined) updateFields.reorder_qty         = record.reorderQty;
  if (record.reorder_qty         !== undefined) updateFields.reorder_qty         = record.reorder_qty;
  if (record.unitCost            !== undefined) updateFields.unit_cost           = record.unitCost;
  if (record.unit_cost           !== undefined) updateFields.unit_cost           = record.unit_cost;
  if (record.unitMeasurement    !== undefined) updateFields.unit_measurement   = record.unitMeasurement;
  if (record.unit_measurement !== undefined) updateFields.unit_measurement = record.unit_measurement;
  if (record.supplierId          !== undefined) updateFields.supplier_id         = record.supplierId;
  if (record.supplier_id         !== undefined) updateFields.supplier_id         = record.supplier_id;
  if (record.location            !== undefined) updateFields.location            = record.location;

  // Try UPDATE first (existing record)
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('inventory_records')
    .update(updateFields)
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .select();

  if (updateError) {
    throw new Error(`Failed to update inventory record: ${updateError.message}`);
  }

  if (!updateError && updated && updated.length > 0) {
    const normalized = normalizeInventoryRecord(updated[0]);
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
  const { data, error } = await supabaseAdmin
    .from('inventory_records')
    .insert({
      id,
      menu_item_id:        menuItemId,
      restaurant_id:       restaurantId,
      stock:               record.stock               ?? 0,
      low_stock_threshold: record.lowStockThreshold   ?? record.low_stock_threshold ?? 5,
      reorder_point:       record.reorderPoint        ?? record.reorder_point       ?? 10,
      reorder_qty:         record.reorderQty          ?? record.reorder_qty         ?? 20,
      unit_cost:           record.unitCost            ?? record.unit_cost           ?? 0,
      supplier_id:         record.supplierId          ?? record.supplier_id         ?? null,
      location:            record.location            ?? '',
      updated_at:          new Date().toISOString(),
    })
    .select()
    .single();

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

  const { data: existingOpen, error: existingError } = await supabaseAdmin
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

  const { data: supplier } = await supabaseAdmin
    .from('suppliers')
    .select('name')
    .eq('id', supplierId)
    .maybeSingle();
  const { data: menuItem } = await supabaseAdmin
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
  let deleteQuery = supabaseAdmin
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
  items: Array<{ menuItemId: string; quantity: number }>
): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId || !items.length) return;

  await Promise.allSettled(
    items.map(async ({ menuItemId, quantity }) => {
      const { data: rec, error: fetchErr } = await supabaseAdmin
        .from('inventory_records')
        .select('stock')
        .eq('menu_item_id', menuItemId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (fetchErr || !rec) return; // No inventory record for this item — skip silently

      const newStock = Math.max(0, (rec.stock ?? 0) - quantity);
      const { error: updateErr } = await supabaseAdmin
        .from('inventory_records')
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq('menu_item_id', menuItemId)
        .eq('restaurant_id', restaurantId);

      if (updateErr) {
        console.warn(`[decrementInventoryForOrder] Failed to decrement stock for ${menuItemId}:`, updateErr.message);
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

  const { data, error } = await supabaseAdmin
    .from('inventory_records')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('menu_item_id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin.from('stock_movements').insert({
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
  }).then(() => {}).catch(console.warn);

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

  const { data, error } = await supabaseAdmin
    .from('suppliers')
    .insert({
      id,
      name:           supplier.name,
      contact_person: supplier.contactPerson  ?? supplier.contact_person ?? '',
      email:          supplier.email          ?? '',
      phone:          supplier.phone          ?? '',
      address:        supplier.address        ?? '',
      categories:     supplier.categories     ?? [],
      lead_time_days: supplier.leadTimeDays   ?? supplier.lead_time_days ?? 7,
      payment_terms:  supplier.paymentTerms   ?? supplier.payment_terms ?? 'Net 30',
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
  const { data, error } = await supabaseAdmin
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
  const { error } = await supabaseAdmin.from('suppliers').delete().eq('id', id);
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
  const { data, error } = await supabaseAdmin
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

  const { data, error } = await supabaseAdmin
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

    // Use supabaseAdmin so RLS never blocks the fetch — same client used for the write below
    let fetchQuery = supabaseAdmin
      .from('inventory_records')
      .select('stock')
      .eq('menu_item_id', item.menu_item_id);
    if (restaurantId) fetchQuery = fetchQuery.eq('restaurant_id', restaurantId);

    const { data: inv } = await fetchQuery.maybeSingle();

    const oldStock = inv?.stock ?? 0;
    const newStock = oldStock + item.received_qty;

    if (inv) {
      // Existing record — update stock in place
      let updateQuery = supabaseAdmin
        .from('inventory_records')
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq('menu_item_id', item.menu_item_id);
      if (restaurantId) updateQuery = updateQuery.eq('restaurant_id', restaurantId);
      await updateQuery;
    } else {
      // No record yet — insert with generated id
      await supabaseAdmin
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
    await supabaseAdmin.from('stock_movements').insert({
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
    }).then(() => {}).catch(console.warn);
  }

  // Mark PO as received
  const { data, error } = await supabaseAdmin
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
  const { error } = await supabaseAdmin.from('purchase_orders').delete().eq('id', id);
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

  await supabaseAdmin
    .from('inventory_records')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('menu_item_id', waste.menu_item_id)
    .eq('restaurant_id', restaurantId);

  const { data, error } = await supabaseAdmin
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
  const [inventory, movements, waste, pos] = await Promise.all([
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
    const payload = await apiRequest<any[]>('/api/locations');
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
    console.warn('fetchLocations fallback unavailable, returning empty list.');
    return [];
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
    const created = await apiRequest<any>('/api/locations', {
      method: 'POST',
      json: payload,
    });
    return normalizeLocation(created);
  } catch (apiErr) {
    const restaurantId = getRestaurantId();
    if (!restaurantId) throw new Error('No company selected');

    const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { data, error } = await supabaseAdmin
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

    if (error) throw error;
    return normalizeLocation(data);
  }
}

type ForecastGenerateResponse = {
  success: boolean;
  count: number;
  forecasts: any[];
};

export async function fetchForecasts(): Promise<InventoryForecast[]> {
  try {
    const forecasts = await apiRequest<any[]>('/api/forecasting');
    return Array.isArray(forecasts) ? forecasts.map(normalizeForecast) : [];
  } catch (error) {
    console.warn('fetchForecasts backend endpoint unavailable, using Supabase fallback.');
  }

  try {
    const restaurantId = getRestaurantId();
    if (!restaurantId) return [];

    const { data, error } = await supabase
      .from('inventory_forecasts')
      .select('*')
      .order('days_until_stockout', { ascending: true });

    if (error) throw error;
    return (data || []).map(normalizeForecast);
  } catch (fallbackErr) {
    console.warn('fetchForecasts fallback unavailable, returning empty list.');
    return [];
  }
}

export async function generateForecasts() {
  try {
    const payload = await apiRequest<ForecastGenerateResponse>('/api/forecasting/generate', {
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
    const alerts = await apiRequest<any[]>('/api/forecasting/alerts');
    return Array.isArray(alerts) ? alerts.map(normalizeForecast) : [];
  } catch (error) {
    const forecasts = await fetchForecasts();
    return forecasts.filter((f) => f.alertStatus === 'critical' || f.alertStatus === 'warning');
  }
}
