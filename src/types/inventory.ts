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
