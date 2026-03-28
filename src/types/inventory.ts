// ============================================
// ADVANCED INVENTORY MANAGEMENT - TYPES
// ============================================

export interface InventoryRecord {
  menuItemId: string;
  stock: number;
  lowStockThreshold: number;
  reorderPoint: number;
  reorderQty: number;
  unitCost: number; // cost per unit in RWF
  supplierId?: string;
  location?: string; // e.g. "Bar Fridge", "Dry Store"
  updatedAt: string; // ISO
}

// ── Suppliers ──────────────────────────────────────────────────────────────
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  categories: string[]; // which menu categories they supply
  leadTimeDays: number;
  paymentTerms: string; // e.g. "Net 30"
  rating: number; // 1-5
  isActive: boolean;
  createdAt: string;
  notes?: string;
}

// ── Purchase Orders ────────────────────────────────────────────────────────
export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'confirmed'
  | 'partial'
  | 'received'
  | 'cancelled';

export interface PurchaseOrderItem {
  menuItemId: string;
  menuItemName: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  totalCost: number;
  expectedDelivery: string; // ISO date
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
  notes?: string;
  createdBy: string;
}

// ── Stock Movements ────────────────────────────────────────────────────────
export type StockMovementType =
  | 'purchase'      // received from supplier
  | 'sale'          // consumed by order
  | 'adjustment'    // manual correction
  | 'waste'         // spoilage / breakage
  | 'transfer'      // moved between locations
  | 'return';       // returned to supplier

export interface StockMovement {
  id: string;
  menuItemId: string;
  menuItemName: string;
  type: StockMovementType;
  qty: number;          // positive = in, negative = out
  stockBefore: number;
  balanceAfter: number;
  unitCost?: number;
  totalValue?: number;
  reference?: string;   // PO id, order id, etc.
  performedBy: string;
  notes?: string;
  timestamp: string;    // ISO
}

// ── Waste Log ──────────────────────────────────────────────────────────────
export type WasteReason =
  | 'expired'
  | 'spoiled'
  | 'damaged'
  | 'overproduction'
  | 'spillage'
  | 'other';

export interface WasteEntry {
  id: string;
  menuItemId: string;
  menuItemName: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  reason: WasteReason;
  reportedBy: string;
  recordedBy: string;
  notes?: string;
  timestamp: string; // ISO
}

// ── Inventory Analytics ────────────────────────────────────────────────────
export interface InventoryAnalytics {
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
  stockTurnoverRate: number; // times per month
  categoryBreakdown: {
    category: string;
    stockValue: number;
    itemCount: number;
  }[];
}

// ── Inventory Forecasting ─────────────────────────────────────────────────────
export interface InventoryForecast {
  id: string;
  menuItemId: string;
  menuItemName: string;
  forecastDate: string;
  predictedConsumption: number;
  confidenceLevel: number; // 0-1
  recommendedReorderQty: number;
  leadTimeDays: number;
  seasonalityFactor: number; // >1 = higher than average
  trendFactor: number; // >1 = increasing, <1 = decreasing
  lastStockLevel: number;
  daysUntilStockout: number;
  alertStatus: 'none' | 'warning' | 'critical';
}

export interface ForecastSummary {
  totalItems: number;
  criticalAlerts: number;
  warningAlerts: number;
  avgConfidence: number;
}

// ============================================
// UNIFIED INVENTORY MANAGEMENT - NEW TYPES
// ============================================

export interface InventoryLocation {
  id: string;
  restaurantId: string;
  name: string;
  type: 'warehouse' | 'walk_in' | 'dry_store' | 'bar' | 'kitchen' | 'cold_room' | 'freezer' | 'display' | 'other';
  description?: string;
  isActive: boolean;
  capacity?: number;
  temperatureRange?: string;
  totalItems: number;
  totalStock: number;
  lowStockItems: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockByLocation {
  locationId: string;
  locationName: string;
  quantity: number;
  reservedQty: number;
  minLevel: number;
  maxLevel: number;
  reorderPoint: number;
  reorderQty: number;
  safetyStock: number;
}

export interface UnifiedInventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  sku?: string;
  category: string;
  subCategory?: string;
  unitOfMeasure: string;
  unitConversion: number;
  isTracked: boolean;
  isActive: boolean;
  stockByLocation: StockByLocation[];
  totalStock: number;
  totalValue: number;
  linkedMenuItems: {
    menuItemId: string;
    menuItemName: string;
    quantityPerServing: number;
    unitOfMeasure: string;
  }[];
  activeAlerts: {
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  restaurantId: string;
  menuItemId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unitOfMeasure: string;
  yieldPercentage: number;
  isOptional: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeRequirement {
  menuItemId: string;
  menuItemName: string;
  ingredients: {
    inventoryItemId: string;
    inventoryItemName: string;
    quantityNeeded: number;
    quantityAvailable: number;
    unitOfMeasure: string;
    canFulfill: boolean;
  }[];
  canFulfillAll: boolean;
  maxServings: number;
}

export interface InventoryLot {
  id: string;
  restaurantId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  locationName: string;
  lotNumber?: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  receivedDate: string;
  expiryDate?: string;
  supplierId?: string;
  supplierName?: string;
  purchaseOrderId?: string;
  isExpired: boolean;
  daysUntilExpiry?: number;
  isFullyConsumed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CycleCount {
  id: string;
  restaurantId: string;
  locationId?: string;
  locationName?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate: string;
  completedDate?: string;
  countedBy?: string;
  varianceNotes?: string;
  totalItems: number;
  countedItems: number;
  varianceItems: number;
  totalVarianceValue: number;
  items: CycleCountItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CycleCountItem {
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
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface InventoryAlert {
  id: string;
  restaurantId: string;
  alertType: 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired' | 'below_par' | 'overstock' | 'count_variance' | 'price_change';
  inventoryItemId?: string;
  inventoryItemName?: string;
  locationId?: string;
  locationName?: string;
  thresholdValue?: number;
  currentValue?: number;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}
