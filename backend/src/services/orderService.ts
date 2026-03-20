import { pool } from '../db.js';
import { emitOrderUpdate } from '../socket.js';
import { decrementStockForOrderLines } from './inventoryService.js';

export interface OrderLine {
  menuItemId: string;
  menuItemName?: string;
  quantity: number;
  unitPrice: number;
  modifiers?: string[];
  notes?: string;
}

export async function createOrder(orderInput: {
  tableNumber?: number;
  customerName?: string;
  items: OrderLine[];
  notes?: string;
  createdBy?: string;
}) {
  const {
    tableNumber,
    customerName = 'Walk-in',
    items,
    notes,
    createdBy = 'system'
  } = orderInput;

  if (!items || items.length === 0) {
    throw new Error('Order must include at least one item');
  }

  const id = `order_${Date.now().toString(36)}`;
  const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const tax = Math.round(subtotal * 0.15);
  const total = subtotal + tax;

  const orderItems = items.map((item, index) => ({
    id: `item_${Date.now().toString(36)}_${index}`,
    menuItemId: item.menuItemId,
    menuItemName: item.menuItemName ?? item.menuItemId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.unitPrice * item.quantity,
    modifiers: item.modifiers || [],
    notes: item.notes || '',
    status: 'pending',
  }));

  const result = await pool.query(
    `INSERT INTO orders 
      (id, order_number, table_number, customer_name, status, items, subtotal, tax, total, notes, created_by)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, orderNumber, tableNumber, customerName, JSON.stringify(orderItems), subtotal, tax, total, notes, createdBy]
  );

  await decrementStockForOrderLines(orderItems.map((i) => ({ menuItemId: i.menuItemId, menuItemName: i.menuItemName, quantity: i.quantity })), createdBy, orderNumber);

  const order = { ...result.rows[0], items: orderItems };
  emitOrderUpdate({ type: 'create', order });

  return order;
}
