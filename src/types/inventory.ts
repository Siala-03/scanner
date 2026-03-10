export interface InventoryRecord {
  menuItemId: string;
  stock: number;
  lowStockThreshold: number;
  updatedAt: string; // ISO
}

