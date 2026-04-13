import { supabase, type InventoryRecord as SupabaseInventoryRecord, type Supplier as SupabaseSupplier } from '../lib/supabase';

function getRestaurantId(): string | undefined {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('restaurantId') || undefined;
  }
  return undefined;
}

// ── Inventory Records ────────────────────────────────────────────────────────

export async function fetchInventory(): Promise<SupabaseInventoryRecord[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('inventory_records')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('menu_item_id');

  if (error) return [];
  return data as SupabaseInventoryRecord[];
}

export async function fetchInventoryById(menuItemId: string): Promise<SupabaseInventoryRecord> {
  const { data, error } = await supabase
    .from('inventory_records')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .single();

  if (error) throw error;
  return data as SupabaseInventoryRecord;
}

export async function createInventoryRecord(record: Partial<SupabaseInventoryRecord>): Promise<SupabaseInventoryRecord> {
  const restaurantId = getRestaurantId();
  const id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data, error } = await supabase
    .from('inventory_records')
    .insert({
      id,
      menu_item_id: record.menu_item_id,
      stock: record.stock || 0,
      low_stock_threshold: record.low_stock_threshold || 5,
      reorder_point: record.reorder_point || 10,
      reorder_qty: record.reorder_qty || 20,
      unit_cost: record.unit_cost || 0,
      supplier_id: record.supplier_id || null,
      location: record.location || '',
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data as SupabaseInventoryRecord;
}

export async function updateInventoryRecord(
  menuItemId: string,
  record: Partial<SupabaseInventoryRecord>
): Promise<SupabaseInventoryRecord> {
  const { data, error } = await supabase
    .from('inventory_records')
    .upsert({
      menu_item_id: menuItemId,
      stock: record.stock,
      low_stock_threshold: record.low_stock_threshold,
      reorder_point: record.reorder_point,
      reorder_qty: record.reorder_qty,
      unit_cost: record.unit_cost,
      supplier_id: record.supplier_id,
      location: record.location,
      updated_at: new Date().toISOString()
    }, { onConflict: 'menu_item_id,restaurant_id' })
    .select()
    .single();

  if (error) throw error;
  return data as SupabaseInventoryRecord;
}

export async function adjustStock(
  menuItemId: string,
  adjustment: number,
  reason: string,
  performedBy: string
): Promise<SupabaseInventoryRecord> {
  // Get current stock
  const { data: current, error: fetchError } = await supabase
    .from('inventory_records')
    .select('stock')
    .eq('menu_item_id', menuItemId)
    .single();

  if (fetchError) throw fetchError;

  const newStock = (current?.stock || 0) + adjustment;
  
  // Update stock
  const { data, error } = await supabase
    .from('inventory_records')
    .update({
      stock: Math.max(0, newStock),
      updated_at: new Date().toISOString()
    })
    .eq('menu_item_id', menuItemId)
    .select()
    .single();

  if (error) throw error;

  // Record movement
  await supabase.from('stock_movements').insert({
    id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    menu_item_id: menuItemId,
    menu_item_name: menuItemId,
    type: adjustment > 0 ? 'purchase' : 'adjustment',
    qty: Math.abs(adjustment),
    stock_before: current?.stock || 0,
    balance_after: Math.max(0, newStock),
    performed_by: performedBy,
    notes: reason,
    restaurant_id: getRestaurantId()
  });

  return data as SupabaseInventoryRecord;
}

export async function deleteInventoryRecord(menuItemId: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_records')
    .delete()
    .eq('menu_item_id', menuItemId);

  if (error) throw error;
}

export async function fetchLowStockItems(): Promise<SupabaseInventoryRecord[]> {
  const restaurantId = getRestaurantId();
  const { data, error } = await supabase
    .from('inventory_records')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .lte('stock', supabase.raw('low_stock_threshold'))
    .order('stock', { ascending: true });

  if (error) {
    console.error('Error fetching low stock items:', error);
    return [];
  }
  return data as SupabaseInventoryRecord[];
}

// ── Locations ────────────────────────────────────────────────────────────────

export async function fetchLocations(): Promise<Array<{
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  low_stock_items: number;
  total_items: number;
}>> {
  const restaurantId = getRestaurantId();
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) return [];
  return data;
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function fetchSuppliers(): Promise<SupabaseSupplier[]> {
  const restaurantId = getRestaurantId();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) return [];
  return data as SupabaseSupplier[];
}

export async function fetchSupplierById(id: string): Promise<SupabaseSupplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as SupabaseSupplier;
}

export async function createSupplier(supplier: Partial<SupabaseSupplier>): Promise<SupabaseSupplier> {
  const restaurantId = getRestaurantId();
  const id = `sup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      id,
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      categories: supplier.categories || [],
      lead_time_days: supplier.lead_time_days || 7,
      payment_terms: supplier.payment_terms || 'Net 30',
      rating: supplier.rating || 3,
      is_active: supplier.is_active !== false,
      notes: supplier.notes || '',
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data as SupabaseSupplier;
}

export async function updateSupplier(id: string, supplier: Partial<SupabaseSupplier>): Promise<SupabaseSupplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name: supplier.name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      categories: supplier.categories,
      lead_time_days: supplier.lead_time_days,
      payment_terms: supplier.payment_terms,
      rating: supplier.rating,
      is_active: supplier.is_active,
      notes: supplier.notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as SupabaseSupplier;
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ── Purchase Orders ─────────────────────────────────────────────────────────

interface PurchaseOrder {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: string;
  items: any[];
  total_cost: number;
  expected_delivery: string | null;
  received_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function fetchPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  const restaurantId = getRestaurantId();
  let query = supabase
    .from('purchase_orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return [];
  return data;
}

export async function createPurchaseOrder(po: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const restaurantId = getRestaurantId();
  const id = `po-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      id,
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      status: 'draft',
      items: po.items || [],
      total_cost: po.total_cost || 0,
      expected_delivery: po.expected_delivery || null,
      notes: po.notes || null,
      created_by: po.created_by || 'system',
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePurchaseOrder(id: string, po: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .update({
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      status: po.status,
      items: po.items,
      total_cost: po.total_cost,
      expected_delivery: po.expected_delivery,
      notes: po.notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function receivePurchaseOrder(
  id: string,
  receivedItems: { menu_item_id: string; received_qty: number }[],
  receivedBy: string
): Promise<PurchaseOrder> {
  // Get the PO
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (poError) throw poError;

  // Update inventory for received items
  for (const item of receivedItems) {
    const { data: inv } = await supabase
      .from('inventory_records')
      .select('stock')
      .eq('menu_item_id', item.menu_item_id)
      .single();

    const newStock = (inv?.stock || 0) + item.received_qty;
    
    await supabase
      .from('inventory_records')
      .upsert({
        menu_item_id: item.menu_item_id,
        stock: newStock,
        updated_at: new Date().toISOString()
      }, { onConflict: 'menu_item_id,restaurant_id' });

    // Record movement
    await supabase.from('stock_movements').insert({
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      menu_item_id: item.menu_item_id,
      menu_item_name: item.menu_item_id,
      type: 'purchase',
      qty: item.received_qty,
      stock_before: inv?.stock || 0,
      balance_after: newStock,
      performed_by: receivedBy,
      reference: `PO: ${id}`,
      restaurant_id: getRestaurantId()
    });
  }

  // Update PO status
  const { data, error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'received',
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ── Stock Movements ─────────────────────────────────────────────────────────

interface StockMovement {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  type: string;
  qty: number;
  stock_before: number;
  balance_after: number;
  unit_cost: number | null;
  total_value: number | null;
  reference: string | null;
  performed_by: string;
  notes: string | null;
  timestamp: string;
}

export async function fetchMovements(filters?: {
  menu_item_id?: string;
  type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const restaurantId = getRestaurantId();
  let query = supabase
    .from('stock_movements')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('timestamp', { ascending: false });

  if (filters?.menu_item_id) {
    query = query.eq('menu_item_id', filters.menu_item_id);
  }
  if (filters?.type) {
    query = query.eq('type', filters.type);
  }
  if (filters?.from_date) {
    query = query.gte('timestamp', filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte('timestamp', filters.to_date);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) return [];
  return data;
}

export async function createMovement(movement: Partial<StockMovement>): Promise<StockMovement> {
  const restaurantId = getRestaurantId();
  const id = `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data, error } = await supabase
    .from('stock_movements')
    .insert({
      id,
      menu_item_id: movement.menu_item_id,
      menu_item_name: movement.menu_item_name,
      type: movement.type,
      qty: movement.qty,
      stock_before: movement.stock_before,
      balance_after: movement.balance_after,
      unit_cost: movement.unit_cost,
      total_value: movement.total_value,
      reference: movement.reference,
      performed_by: movement.performed_by,
      notes: movement.notes,
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Waste Entries ───────────────────────────────────────────────────────────

interface WasteEntry {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  qty: number;
  unit_cost: number;
  total_cost: number;
  reason: string;
  reported_by: string;
  recorded_by: string;
  notes: string | null;
  timestamp: string;
}

export async function fetchWasteEntries(filters?: {
  menu_item_id?: string;
  reason?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<WasteEntry[]> {
  const restaurantId = getRestaurantId();
  let query = supabase
    .from('waste_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('timestamp', { ascending: false });

  if (filters?.menu_item_id) {
    query = query.eq('menu_item_id', filters.menu_item_id);
  }
  if (filters?.reason) {
    query = query.eq('reason', filters.reason);
  }
  if (filters?.from_date) {
    query = query.gte('timestamp', filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte('timestamp', filters.to_date);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) return [];
  return data;
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

  // Deduct from inventory
  const { data: inv } = await supabase
    .from('inventory_records')
    .select('stock')
    .eq('menu_item_id', waste.menu_item_id)
    .single();

  const newStock = Math.max(0, (inv?.stock || 0) - waste.qty);
  
  await supabase
    .from('inventory_records')
    .upsert({
      menu_item_id: waste.menu_item_id,
      stock: newStock,
      updated_at: new Date().toISOString()
    }, { onConflict: 'menu_item_id,restaurant_id' });

  // Create waste entry
  const { data, error } = await supabase
    .from('waste_entries')
    .insert({
      id,
      menu_item_id: waste.menu_item_id,
      menu_item_name: waste.menu_item_name,
      qty: waste.qty,
      unit_cost: waste.unit_cost,
      total_cost: waste.qty * waste.unit_cost,
      reason: waste.reason,
      reported_by: waste.reported_by,
      recorded_by: waste.recorded_by,
      notes: waste.notes || null,
      restaurant_id: restaurantId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Analytics ────────────────────────────────────────────────────────────────

interface InventoryAnalytics {
  totalStockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingPOCount: number;
  pendingPOValue: number;
  wasteCostLast30d: number;
  avgTurnoverDays: number;
  belowReorderCount: number;
  topWasteReason: string | null;
  wasteByReason: { reason: string; qty: number; cost: number }[];
  topWasteItems: { menuItemId: string; menuItemName: string; qty: number; cost: number }[];
  stockTurnoverRate: number;
  categoryBreakdown: { category: string; value: number }[];
}

export async function computeInventoryAnalytics(): Promise<InventoryAnalytics> {
  const restaurantId = getRestaurantId();
  
  const [inventory, lowStock, movements, waste, pos] = await Promise.all([
    fetchInventory(),
    fetchLowStockItems(),
    fetchMovements({ limit: 200 }),
    fetchWasteEntries({ limit: 200 }),
    fetchPurchaseOrders()
  ]);

  const totalStockValue = inventory.reduce(
    (sum, item) => sum + (item.stock || 0) * (item.unit_cost || 0),
    0
  );

  const outOfStockCount = inventory.filter((item) => item.stock === 0).length;
  const belowReorderCount = inventory.filter(
    (item) => (item.stock || 0) <= (item.reorder_point || 0)
  ).length;

  const pendingPO = pos.filter(p => !['received', 'cancelled'].includes(p.status));
  const pendingPOCount = pendingPO.length;
  const pendingPOValue = pendingPO.reduce((sum, po) => sum + (po.total_cost || 0), 0);

  // Calculate waste in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentWaste = waste.filter(w => new Date(w.timestamp) >= thirtyDaysAgo);
  const wasteCostLast30d = recentWaste.reduce((sum, w) => sum + (w.total_cost || 0), 0);

  // Group waste by reason
  const wasteByReasonMap = new Map<string, { qty: number; cost: number }>();
  recentWaste.forEach(w => {
    const existing = wasteByReasonMap.get(w.reason) || { qty: 0, cost: 0 };
    existing.qty += w.qty;
    existing.cost += w.total_cost || 0;
    wasteByReasonMap.set(w.reason, existing);
  });
  const wasteByReason = Array.from(wasteByReasonMap.entries()).map(([reason, data]) => ({
    reason,
    qty: data.qty,
    cost: data.cost
  }));

  // Top waste reason
  const topWasteReason = wasteByReason.length > 0 
    ? wasteByReason.sort((a, b) => b.cost - a.cost)[0].reason 
    : null;

  return {
    totalStockValue,
    lowStockCount: lowStock.length,
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

// ── Forecasting (simplified - would need more complex implementation) ────────

interface InventoryForecast {
  menu_item_id: string;
  menu_item_name: string;
  current_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number;
  suggested_reorder_qty: number;
  alert_status: string;
}

export async function fetchForecasts(): Promise<InventoryForecast[]> {
  // Simplified - would need sales history to calculate
  return [];
}

export async function generateForecasts(): Promise<{ success: boolean; count: number; forecasts: InventoryForecast[] }> {
  return { success: true, count: 0, forecasts: [] };
}

export async function fetchForecastAlerts(): Promise<InventoryForecast[]> {
  return [];
}