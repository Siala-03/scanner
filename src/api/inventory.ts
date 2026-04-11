import { apiRequest } from './http';
import type {
  InventoryRecord,
  InventoryLocation,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockMovement,
  WasteEntry,
  WasteReason,
  InventoryAnalytics,
  InventoryForecast,
  RecipeIngredient,
  RecipeRequirement,
} from '../types/inventory';

// Types for cycle counts (add to types/inventory.ts later)
interface CycleCount {
  id: string;
  restaurantId: string;
  locationId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate: string;
  completedDate?: string;
  countedBy?: string;
  varianceNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CycleCountItem {
  id: string;
  cycleCountId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  systemQty: number;
  countedQty?: number;
  variance?: number;
  varianceReason?: string;
  countedBy?: string;
  countedAt?: string;
}

// Base API URL
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

// ── Inventory Records ────────────────────────────────────────────────────────

export async function fetchInventory(): Promise<InventoryRecord[]> {
  return apiRequest<InventoryRecord[]>(`${API_BASE}/inventory`);
}

export async function fetchInventoryById(menuItemId: string): Promise<InventoryRecord> {
  return apiRequest<InventoryRecord>(`${API_BASE}/inventory/${encodeURIComponent(menuItemId)}`);
}

export async function createInventoryRecord(record: Partial<InventoryRecord>): Promise<InventoryRecord> {
  return apiRequest<InventoryRecord>(`${API_BASE}/inventory`, {
    method: 'POST',
    json: record,
  });
}

export async function updateInventoryRecord(
  menuItemId: string,
  record: Partial<InventoryRecord>
): Promise<InventoryRecord> {
  return apiRequest<InventoryRecord>(`${API_BASE}/inventory/${encodeURIComponent(menuItemId)}`, {
    method: 'PUT',
    json: record,
  });
}

export async function adjustStock(
  menuItemId: string,
  adjustment: number,
  reason: string,
  performedBy: string
): Promise<InventoryRecord> {
  return apiRequest<InventoryRecord>(`${API_BASE}/inventory/${encodeURIComponent(menuItemId)}/adjust`, {
    method: 'PATCH',
    json: { adjustment, reason, performed_by: performedBy, locationId: 'default' },
  });
}

export async function deleteInventoryRecord(menuItemId: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/inventory/${encodeURIComponent(menuItemId)}`, {
    method: 'DELETE',
  });
}

export async function fetchLowStockItems(): Promise<InventoryRecord[]> {
  return apiRequest<InventoryRecord[]>(`${API_BASE}/inventory/alerts/low-stock`);
}

// ── Locations (new unified inventory support) ─────────────────────────────────
export async function fetchLocations(): Promise<InventoryLocation[]> {
  return apiRequest<InventoryLocation[]>(`${API_BASE}/locations`);
}

export async function fetchLocationStock(locationId: string): Promise<{
  itemId: string;
  itemName: string;
  category: string;
  unitOfMeasure: string;
  quantity: number;
  reservedQty: number;
  minLevel: number;
  maxLevel: number;
  reorderPoint: number;
  reorderQty: number;
  safetyStock: number;
}[]> {
  return apiRequest(`${API_BASE}/locations/${locationId}/stock`);
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function fetchSuppliers(): Promise<Supplier[]> {
  return apiRequest<Supplier[]>(`${API_BASE}/suppliers`);
}

export async function fetchSupplierById(id: string): Promise<Supplier> {
  return apiRequest<Supplier>(`${API_BASE}/suppliers/${id}`);
}

export async function createSupplier(supplier: Partial<Supplier>): Promise<Supplier> {
  return apiRequest<Supplier>(`${API_BASE}/suppliers`, {
    method: 'POST',
    json: supplier,
  });
}

export async function updateSupplier(id: string, supplier: Partial<Supplier>): Promise<Supplier> {
  return apiRequest<Supplier>(`${API_BASE}/suppliers/${id}`, {
    method: 'PUT',
    json: supplier,
  });
}

export async function deleteSupplier(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/suppliers/${id}`, {
    method: 'DELETE',
  });
}

// ── Purchase Orders ─────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return apiRequest<PurchaseOrder[]>(`${API_BASE}/purchase-orders${query}`);
}

export async function fetchPurchaseOrderById(id: string): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}`);
}

export async function createPurchaseOrder(po: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`${API_BASE}/purchase-orders`, {
    method: 'POST',
    json: po,
  });
}

export async function updatePurchaseOrder(
  id: string,
  po: Partial<PurchaseOrder>
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}`, {
    method: 'PUT',
    json: po,
  });
}

export async function receivePurchaseOrder(
  id: string,
  receivedItems: { menu_item_id: string; received_qty: number }[],
  receivedBy: string
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}/receive`, {
    method: 'POST',
    json: { received_items: receivedItems, received_by: receivedBy },
  });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  return apiRequest<void>(`${API_BASE}/purchase-orders/${id}`, {
    method: 'DELETE',
  });
}

// ── Stock Movements ─────────────────────────────────────────────────────────

export async function fetchMovements(filters?: {
  menu_item_id?: string;
  type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (filters?.menu_item_id) params.set('menu_item_id', filters.menu_item_id);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.from_date) params.set('from_date', filters.from_date);
  if (filters?.to_date) params.set('to_date', filters.to_date);
  if (filters?.limit) params.set('limit', String(filters.limit));
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<StockMovement[]>(`${API_BASE}/movements${query}`);
}

export async function createMovement(movement: Partial<StockMovement>): Promise<StockMovement> {
  return apiRequest<StockMovement>(`${API_BASE}/movements`, {
    method: 'POST',
    json: movement,
  });
}

export async function fetchMovementSummary() {
  return apiRequest<{
    totals: { total: number; total_qty: number };
    byType: { type: string; count: number; total_qty: number; total_value: number }[];
    recent: StockMovement[];
  }>(`${API_BASE}/movements/summary/overview`);
}

// ── Waste Entries ───────────────────────────────────────────────────────────

export async function fetchWasteEntries(filters?: {
  menu_item_id?: string;
  reason?: WasteReason;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<WasteEntry[]> {
  const params = new URLSearchParams();
  if (filters?.menu_item_id) params.set('menu_item_id', filters.menu_item_id);
  if (filters?.reason) params.set('reason', filters.reason);
  if (filters?.from_date) params.set('from_date', filters.from_date);
  if (filters?.to_date) params.set('to_date', filters.to_date);
  if (filters?.limit) params.set('limit', String(filters.limit));
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<WasteEntry[]>(`${API_BASE}/waste${query}`);
}

export async function recordWaste(waste: {
  menu_item_id: string;
  menu_item_name: string;
  qty: number;
  unit_cost: number;
  reason: WasteReason;
  reported_by: string;
  recorded_by: string;
  notes?: string;
}): Promise<WasteEntry> {
  return apiRequest<WasteEntry>(`${API_BASE}/waste`, {
    method: 'POST',
    json: waste,
  });
}

export async function fetchWasteSummary() {
  return apiRequest<{
    totals: { total_entries: number; total_qty: number; total_cost: number };
    byReason: { reason: string; count: number; total_qty: number; total_cost: number }[];
    topItems: { menu_item_id: string; menu_item_name: string; total_qty: number; total_cost: number }[];
    topReason: string | null;
  }>(`${API_BASE}/waste/summary/overview`);
}

// ── Analytics ───────────────────────────────────────────────────────────────

export async function computeInventoryAnalytics(): Promise<InventoryAnalytics> {
  const [inventory, lowStock, movements, waste] = await Promise.all([
    fetchInventory(),
    fetchLowStockItems(),
    fetchMovementSummary(),
    fetchWasteSummary(),
  ]);

  const totalStockValue = inventory.reduce(
    (sum, item) => sum + item.stock * item.unitCost,
    0
  );

  const outOfStockCount = inventory.filter((item) => item.stock === 0).length;
  const belowReorderCount = inventory.filter(
    (item) => item.stock <= item.reorderPoint
  ).length;

  return {
    totalStockValue,
    lowStockCount: lowStock.length,
    outOfStockCount,
    pendingPOCount: 0, // Would fetch from purchase orders
    pendingPOValue: 0,
    wasteCostLast30d: waste.totals?.total_cost || 0,
    avgTurnoverDays: 30, // Simplified
    belowReorderCount,
    topWasteReason: waste.topReason,
    wasteByReason: (waste.byReason || []).map((r) => ({ reason: r.reason, qty: r.total_qty, cost: r.total_cost })),
    topWasteItems: (waste.topItems || []).map((i) => ({ menuItemId: i.menu_item_id, menuItemName: i.menu_item_name, qty: i.total_qty, cost: i.total_cost })),
    stockTurnoverRate: 1, // Simplified
    categoryBreakdown: [], // Would need category data
  };
}

// ── Forecasting ────────────────────────────────────────────────────────────────

export async function fetchForecasts(): Promise<InventoryForecast[]> {
  return apiRequest<InventoryForecast[]>(`${API_BASE}/forecasting`);
}

export async function generateForecasts(): Promise<{ success: boolean; count: number; forecasts: InventoryForecast[] }> {
  return apiRequest<{ success: boolean; count: number; forecasts: InventoryForecast[] }>(`${API_BASE}/forecasting/generate`, {
    method: 'POST',
  });
}

export async function fetchForecastAlerts(): Promise<InventoryForecast[]> {
  return apiRequest<InventoryForecast[]>(`${API_BASE}/forecasting/alerts`);
}

export async function fetchForecastByItem(menuItemId: string, menuItemName?: string): Promise<InventoryForecast> {
  const params = menuItemName ? `?menuItemName=${encodeURIComponent(menuItemName)}` : '';
  return apiRequest<InventoryForecast>(`${API_BASE}/forecasting/${menuItemId}${params}`);
}

// ── Recipes (Ingredient Management) ────────────────────────────────────────

export async function fetchRecipeIngredients(menuItemId: string): Promise<RecipeIngredient[]> {
  return apiRequest<RecipeIngredient[]>(`${API_BASE}/recipes/${menuItemId}`);
}

export async function addRecipeIngredient(
  menuItemId: string,
  ingredient: {
    inventoryItemId: string;
    quantity: number;
    unitOfMeasure: string;
    yieldPercentage?: number;
    isOptional?: boolean;
  }
): Promise<RecipeIngredient> {
  return apiRequest<RecipeIngredient>(`${API_BASE}/recipes/${menuItemId}`, {
    method: 'POST',
    json: ingredient,
  });
}

export async function updateRecipeIngredient(
  menuItemId: string,
  ingredientId: string,
  updates: Partial<{
    quantity: number;
    unitOfMeasure: string;
    yieldPercentage: number;
    isOptional: boolean;
  }>
): Promise<RecipeIngredient> {
  return apiRequest<RecipeIngredient>(`${API_BASE}/recipes/${menuItemId}/${ingredientId}`, {
    method: 'PUT',
    json: updates,
  });
}

export async function deleteRecipeIngredient(
  menuItemId: string,
  ingredientId: string
): Promise<void> {
  return apiRequest<void>(`${API_BASE}/recipes/${menuItemId}/${ingredientId}`, {
    method: 'DELETE',
  });
}

export async function checkStockRequirements(
  menuItemId: string,
  quantity: number = 1,
  locationId?: string
): Promise<RecipeRequirement> {
  return apiRequest<RecipeRequirement>(`${API_BASE}/recipes/${menuItemId}/requirements`, {
    method: 'POST',
    json: { quantity, locationId },
  });
}

// ── Cycle Counts (Stock Takes) ────────────────────────────────────────────

export async function listCycleCounts(status?: string): Promise<CycleCount[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<CycleCount[]>(`${API_BASE}/cycle-counts${query}`);
}

export async function createCycleCount(
  scheduledDate: string,
  locationId?: string
): Promise<CycleCount> {
  return apiRequest<CycleCount>(`${API_BASE}/cycle-counts`, {
    method: 'POST',
    json: { scheduledDate, locationId },
  });
}

export async function getCycleCount(cycleCountId: string): Promise<{
  cycle: CycleCount;
  items: CycleCountItem[];
}> {
  return apiRequest<{ cycle: CycleCount; items: CycleCountItem[] }>(
    `${API_BASE}/cycle-counts/${cycleCountId}`
  );
}

export async function recordCycleCountItem(
  cycleCountId: string,
  itemId: string,
  countedQty: number,
  varianceReason?: string
): Promise<CycleCountItem> {
  return apiRequest<CycleCountItem>(
    `${API_BASE}/cycle-counts/${cycleCountId}/items/${itemId}`,
    {
      method: 'PATCH',
      json: { countedQty, varianceReason },
    }
  );
}

export async function completeCycleCount(
  cycleCountId: string,
  varianceNotes?: string
): Promise<CycleCount> {
  return apiRequest<CycleCount>(
    `${API_BASE}/cycle-counts/${cycleCountId}/complete`,
    {
      method: 'POST',
      json: { varianceNotes },
    }
  );
}

export async function cancelCycleCount(cycleCountId: string): Promise<CycleCount> {
  return apiRequest<CycleCount>(
    `${API_BASE}/cycle-counts/${cycleCountId}/cancel`,
    {
      method: 'POST',
    }
  );
}
