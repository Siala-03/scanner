import { z } from 'zod';

export const InventoryItemSchema = z.object({
  name: z.string().min(2).max(100),
  sku: z.string().min(3).max(50),
  category: z.string(),
  unit_of_measure: z.string(),
  unit_cost: z.number().nonnegative(),
  is_tracked: z.boolean().default(true),
});

export const PurchaseOrderSchema = z.object({
  supplier_id: z.string().uuid(),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit_cost: z.number().nonnegative(),
  })).min(1),
  notes: z.string().optional(),
});

export type InventoryItemInput = z.infer<typeof InventoryItemSchema>;
export type PurchaseOrderInput = z.infer<typeof PurchaseOrderSchema>;