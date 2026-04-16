import { pool } from '../db.js';
import { emitOrderUpdate } from '../socket.js';
import { decrementStockForOrderLines } from './inventoryService.js';
import { createVubaVubaOrder, updateVubaVubaOrderStatus } from './vubaVubaService.js';

function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 7; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

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
  customerId?: string;
  restaurantId?: string;
  items: OrderLine[];
  notes?: string;
  createdBy?: string;
  deliveryProvider?: string;
  deliveryAddress?: string;
  loyaltyRewardId?: string;
  requiresKitchen?: boolean;
}) {
  const {
    tableNumber,
    customerName = 'Walk-in',
    customerId,
    restaurantId,
    items,
    notes,
    createdBy = 'system',
    deliveryProvider,
    deliveryAddress,
    loyaltyRewardId,
    requiresKitchen = false
  } = orderInput;

  if (!restaurantId) {
    throw new Error('restaurantId is required to create an order');
  }

  console.log('createOrder service invoked', {
    restaurantId,
    tableNumber,
    customerId,
    itemsCount: Array.isArray(items) ? items.length : 0,
    requiresKitchen,
  });

  if (!items || items.length === 0) {
    throw new Error('Order must include at least one item');
  }

  const id = `order_${Date.now().toString(36)}`;
  const orderNumber = generateOrderNumber();

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const tax = Math.round(subtotal * 0.15);
  let total = subtotal + tax;

  let loyaltyDiscount = 0;
  let loyaltyFreeItemId: string | null = null;

  if (loyaltyRewardId) {
    const rewardResult = await pool.query('SELECT * FROM rewards WHERE id = $1', [loyaltyRewardId]);
    if (rewardResult.rows.length > 0) {
      const reward = rewardResult.rows[0];
      if (reward.type === 'discount' && reward.discount_percentage) {
        loyaltyDiscount = Math.round((subtotal * reward.discount_percentage) / 100);
        total = Math.max(0, total - loyaltyDiscount);
      }
      if (reward.type === 'free_item' && reward.free_item_id) {
        loyaltyFreeItemId = reward.free_item_id;
      }

      // Redeem the reward by deducting points
      if (customerId) {
        const customerResult = await pool.query('SELECT total_points FROM customers WHERE id = $1', [customerId]);
        if (customerResult.rows.length > 0) {
          const customer = customerResult.rows[0];
          if (customer.total_points >= reward.points_required) {
            // Deduct points
            await pool.query(
              'UPDATE customers SET total_points = total_points - $1, updated_at = now() WHERE id = $2',
              [reward.points_required, customerId]
            );

            // Record redemption
            const redemptionId = `red-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await pool.query(
              'INSERT INTO reward_redemptions (id, customer_id, reward_id, points_used) VALUES ($1, $2, $3, $4)',
              [redemptionId, customerId, loyaltyRewardId, reward.points_required]
            );

            // Record transaction
            const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await pool.query(
              'INSERT INTO loyalty_transactions (id, customer_id, transaction_type, points, description) VALUES ($1, $2, $3, $4, $5)',
              [transactionId, customerId, 'redeemed', -reward.points_required, `Redeemed: ${reward.name}`]
            );
          } else {
            throw new Error('Insufficient points for reward redemption');
          }
        }
      }
    }
  }

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
      (id, order_number, table_number, customer_name, customer_id, restaurant_id, status, items, subtotal, tax, total, notes, created_by, delivery_provider, delivery_address, delivery_status, loyalty_reward_id, loyalty_discount, loyalty_free_item_id, requires_kitchen)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      id,
      orderNumber,
      tableNumber,
      customerName,
      customerId,
      restaurantId,
      JSON.stringify(orderItems),
      subtotal,
      tax,
      total,
      notes,
      createdBy,
      deliveryProvider,
      deliveryAddress,
      deliveryProvider ? 'pending' : null,
      loyaltyRewardId || null,
      loyaltyDiscount,
      loyaltyFreeItemId,
      requiresKitchen
    ]
  );

  await decrementStockForOrderLines(orderItems.map((i) => ({ menuItemId: i.menuItemId, menuItemName: i.menuItemName, quantity: i.quantity })), createdBy, orderNumber);

  let order = { ...result.rows[0], items: orderItems, requiresKitchen };

  if (deliveryProvider === 'VubaVuba') {
    try {
      const deliveryResult = await createVubaVubaOrder({
        ...order,
        deliveryAddress,
        customerPhone: (orderInput as any).customerPhone || ''
      });

      const updated = await pool.query(
        `UPDATE orders SET delivery_order_id = $1, delivery_status = $2, delivery_data = $3, updated_at = $4 WHERE id = $5 RETURNING *`,
        [deliveryResult.deliveryOrderId, deliveryResult.deliveryStatus, JSON.stringify(deliveryResult.rawResponse), new Date().toISOString(), id]
      );

      order = { ...updated.rows[0], items: orderItems };
    } catch (err) {
      console.error('Failed to sync order to VubaVuba:', err);
    }
  }

  emitOrderUpdate({ type: 'create', order });

  return order;
}
