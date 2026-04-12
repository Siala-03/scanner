import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { createOrder as createOrderService } from '../services/orderService.js';
import { emitOrderUpdate } from '../socket.js';
import { createVubaVubaOrder, updateVubaVubaOrderStatus } from '../services/vubaVubaService.js';
import { toCamelCase } from '../utils/camelCase.js';

const router = Router();

function normalizeOrder(row: any): any {
  // Parse items if they're stored as JSON string
  const parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
  const order = {
    ...row,
    items: parsedItems,
    requires_kitchen: row.requires_kitchen ?? false,
    restaurant_id: row.restaurant_id
  };
  // Transform snake_case to camelCase
  return toCamelCase(order);
}

// Generate order number
function generateOrderNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${dateStr}-${random}`;
}

// POST seed test orders
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    // Create some test orders
    const testOrders = [
      {
        table_number: 5,
        customer_name: 'Table 5 Customer',
        status: 'pending',
        items: [
          { menuItemId: 'item-1', menuItemName: 'Breakfast Platter', quantity: 2, unitPrice: 1500, totalPrice: 3000 },
          { menuItemId: 'item-2', menuItemName: 'Fresh Juice', quantity: 2, unitPrice: 500, totalPrice: 1000 }
        ],
        subtotal: 4000,
        tax: 600,
        total: 4600,
        notes: 'No onions please'
      },
      {
        table_number: 8,
        customer_name: 'Table 8 Customer',
        status: 'preparing',
        items: [
          { menuItemId: 'item-3', menuItemName: 'Grilled Chicken', quantity: 1, unitPrice: 2500, totalPrice: 2500 },
          { menuItemId: 'item-4', menuItemName: 'Rice', quantity: 1, unitPrice: 500, totalPrice: 500 }
        ],
        subtotal: 3000,
        tax: 450,
        total: 3450,
        notes: ''
      },
      {
        table_number: 12,
        customer_name: 'Table 12 Customer',
        status: 'ready',
        items: [
          { menuItemId: 'item-5', menuItemName: 'Fish and Chips', quantity: 1, unitPrice: 2000, totalPrice: 2000 }
        ],
        subtotal: 2000,
        tax: 300,
        total: 2300,
        notes: ''
      }
    ];

    const createdOrders = [];
    for (const order of testOrders) {
      const id = `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const order_number = generateOrderNumber();
      
      await pool.query(
        `INSERT INTO orders 
          (id, order_number, table_number, customer_name, status, items, subtotal, tax, total, notes, requires_kitchen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT DO NOTHING`,
        [
          id,
          order_number,
          order.table_number,
          order.customer_name,
          order.status,
          JSON.stringify(order.items),
          order.subtotal,
          order.tax,
          order.total,
          order.notes,
          true
        ]
      );
      createdOrders.push({ id, order_number });
    }

    res.json({ message: 'Test orders created', count: createdOrders.length });
  } catch (error) {
    console.error('Error seeding orders:', error);
    res.status(500).json({ error: 'Failed to seed orders' });
  }
});

// GET all orders (with optional status and date filter)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, startDate, endDate, restaurantId } = req.query;
    let query = 'SELECT * FROM orders';
    const params: unknown[] = [];
    const conditions: string[] = [];

    // Resolve restaurantId: query param > auth header lookup > default
    let resolvedRestaurantId = restaurantId as string;
    if (!resolvedRestaurantId) {
      const staffId = req.headers['x-staff-id'] as string;
      if (staffId) {
        try {
          const staffResult = await pool.query('SELECT restaurant_id FROM staff WHERE id = $1', [staffId]);
          if (staffResult.rows.length > 0) {
            resolvedRestaurantId = staffResult.rows[0].restaurant_id;
          }
        } catch (_e) { /* ignore */ }
      }
    }
    if (!resolvedRestaurantId) {
      return res.status(400).json({ error: 'restaurantId is required' });
    }

    params.push(resolvedRestaurantId);
    conditions.push(`restaurant_id = $${params.length}`);

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate as string);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate as string);
      conditions.push(`created_at <= $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const orders = result.rows.map((row: any) => normalizeOrder(row));
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET kitchen view - orders that need to be prepared
router.get('/kitchen', async (req: Request, res: Response) => {
  try {
    const restaurantId = (req.query.restaurantId as string) || 'default_restaurant';

    const result = await pool.query(
      `SELECT * FROM orders
       WHERE restaurant_id = $1 AND requires_kitchen = true AND status IN ('pending', 'verified', 'preparing', 'ready')
       ORDER BY created_at ASC`,
      [restaurantId]
    );
    const orders = result.rows.map((row: any) => normalizeOrder(row));
    res.json(orders);
  } catch (error) {
    console.error('Error fetching kitchen orders:', error);
    res.status(500).json({ error: 'Failed to fetch kitchen orders' });
  }
});

// GET kitchen analytics
router.get('/kitchen/analytics', async (_req: Request, res: Response) => {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const restaurantId = (_req.query as any)?.restaurantId as string;
    if (!restaurantId) {
      return res.status(400).json({ error: 'restaurantId is required' });
    }
    // Get orders for today
    const todayOrders = await pool.query(
      `SELECT * FROM orders WHERE restaurant_id = $1 AND requires_kitchen = true AND created_at >= $2 AND created_at < $3`,
      [restaurantId, today.toISOString(), tomorrow.toISOString()]
    );

    // Calculate stats
    const orders = todayOrders.rows.map((row: any) => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    }));

    const totalOrders = orders.length;
    const completedOrders = orders.filter((o: any) => o.status === 'served' || o.status === 'completed').length;
    const pendingOrders = orders.filter((o: any) => o.status === 'pending').length;
    const preparingOrders = orders.filter((o: any) => o.status === 'preparing').length;
    const readyOrders = orders.filter((o: any) => o.status === 'ready').length;

    // Calculate average prep time (from created_at to completed_at)
    let avgPrepTime = 0;
    const completedWithTime = orders.filter((o: any) => o.completed_at && o.created_at);
    if (completedWithTime.length > 0) {
      const totalPrepTime = completedWithTime.reduce((sum: number, o: any) => {
        const created = new Date(o.created_at).getTime();
        const completed = new Date(o.completed_at).getTime();
        return sum + (completed - created) / 60000; // minutes
      }, 0);
      avgPrepTime = Math.round(totalPrepTime / completedWithTime.length);
    }

    // Calculate popular items
    const itemCounts: Record<string, number> = {};
    orders.forEach((order: any) => {
      if (order.items) {
        order.items.forEach((item: any) => {
          const name = item.menuItemName || 'Unknown';
          itemCounts[name] = (itemCounts[name] || 0) + (item.quantity || 1);
        });
      }
    });

    const popularItems = Object.entries(itemCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get hourly distribution
    const hourlyCounts: Record<number, number> = {};
    orders.forEach((order: any) => {
      const hour = new Date(order.created_at).getHours();
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    });

    const hourlyDistribution = Object.entries(hourlyCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);

    // Calculate revenue
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);

    res.json({
      totalOrders,
      completedOrders,
      pendingOrders,
      preparingOrders,
      readyOrders,
      avgPrepTime,
      popularItems,
      hourlyDistribution,
      totalRevenue
    });
  } catch (error) {
    console.error('Error fetching kitchen analytics:', error);
    res.status(500).json({ error: 'Failed to fetch kitchen analytics' });
  }
});

// GET single order
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const order = normalizeOrder(result.rows[0]);
    res.json(order);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }
});

// POST create new order
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      table_number,
      tableNumber,
      customer_name,
      customerName,
      customer_id,
      customerId,
      items,
      notes,
      created_by,
      createdBy,
      delivery_provider,
      delivery_provider: deliveryProvider,
      delivery_address,
      deliveryAddress,
      loyalty_reward_id,
      loyaltyRewardId
    } = req.body;

    const resolvedRestaurantId = req.body.restaurantId || req.query.restaurantId;
    if (!resolvedRestaurantId) {
      return res.status(400).json({ error: 'restaurantId is required to create an order' });
    }
    console.log('POST /orders creating order for restaurantId:', resolvedRestaurantId, {
      bodyRestaurantId: req.body.restaurantId,
      queryRestaurantId: req.query.restaurantId,
      tableNumber: table_number ?? tableNumber,
      customerName: customer_name ?? customerName,
      itemsCount: Array.isArray(items) ? items.length : 0,
    });

    const order = await createOrderService({
      tableNumber: table_number ?? tableNumber,
      customerName: customer_name ?? customerName ?? 'Walk-in',
      customerId: customer_id ?? customerId,
      restaurantId: resolvedRestaurantId,
      items: items.map((item: any) => ({
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiers: item.modifiers,
        notes: item.notes,
      })),
      notes,
      createdBy: created_by ?? createdBy ?? 'system',
      deliveryProvider: delivery_provider ?? deliveryProvider,
      deliveryAddress: delivery_address ?? deliveryAddress,
      loyaltyRewardId: loyalty_reward_id ?? loyaltyRewardId,
      requiresKitchen: req.body.requiresKitchen ?? req.body.requires_kitchen ?? false
    });

    const normalizedOrder = normalizeOrder(order);
    console.log('Order created with restaurantId:', normalizedOrder.restaurantId, 'id:', normalizedOrder.id);
    emitOrderUpdate({ type: 'create', order: normalizedOrder });
    res.status(201).json(normalizedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create order' });
  }
});

// POST force-delivery sync for a specific order (admin / webhook retry)
router.post('/:id/delivery-sync', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const order = result.rows[0];
    if (order.delivery_provider !== 'VubaVuba') {
      return res.status(400).json({ error: 'Only VubaVuba orders can be sync' });
    }

    const deliveryResult = await createVubaVubaOrder(order);

    const updated = await pool.query(
      `UPDATE orders SET delivery_order_id=$1, delivery_status=$2, delivery_data=$3, updated_at=$4 WHERE id=$5 RETURNING *`,
      [deliveryResult.deliveryOrderId, deliveryResult.deliveryStatus, JSON.stringify(deliveryResult.rawResponse), new Date().toISOString(), id]
    );

    emitOrderUpdate({ type: 'update', order: updated.rows[0] });
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Delivery sync error:', error);
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to sync delivery order' });
    }
  }
});

// PUT update order status
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, assigned_to } = req.body;

    const updates: string[] = ['status = $1', 'updated_at = $2'];
    const values: unknown[] = [status, new Date().toISOString()];
    let paramIndex = 3;

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(assigned_to);
    }

    if (status === 'served' || status === 'completed') {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(new Date().toISOString());
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const order = normalizeOrder(result.rows[0]);

    // Award loyalty points if order is completed and has a customer
    if ((status === 'served' || status === 'completed') && order.customerId) {
      try {
        // Calculate points (1 point per $10 spent)
        const pointsToAward = Math.floor(order.total / 1000); // total is in cents, so divide by 1000 for $10 = 100 points

        if (pointsToAward > 0) {
          const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          const orderRestaurantId = order.restaurantId;
        await pool.query(`
            INSERT INTO loyalty_transactions (id, customer_id, order_id, transaction_type, points, description, restaurant_id)
            VALUES ($1, $2, $3, 'earned', $4, $5, $6)
          `, [transactionId, order.customerId, id, pointsToAward, `Order completion: ${order.orderNumber}`, orderRestaurantId]);

          await pool.query(`
            UPDATE customers
            SET
              total_points = total_points + $1,
              total_spent = total_spent + $2,
              last_visit = now(),
              visit_count = visit_count + 1,
              updated_at = now()
            WHERE id = $3 AND restaurant_id = $4
          `, [pointsToAward, order.total, order.customerId, orderRestaurantId]);
        }
      } catch (loyaltyError) {
        console.error('Error awarding loyalty points:', loyaltyError);
        // Don't fail the order update if loyalty points fail
      }
    }

    // Notify delivery partner when order is served/completed
    if ((status === 'served' || status === 'completed') && order.deliveryProvider === 'VubaVuba' && order.deliveryOrderId) {
      try {
        const deliveryResult = await updateVubaVubaOrderStatus(order.deliveryOrderId, 'delivered');
        await pool.query(
          `UPDATE orders SET delivery_status=$1, delivery_data = $2, updated_at=$3 WHERE id=$4`,
          [deliveryResult.deliveryStatus, JSON.stringify(deliveryResult.rawResponse), new Date().toISOString(), id]
        );

        order.deliveryStatus = deliveryResult.deliveryStatus;
        order.deliveryData = deliveryResult.rawResponse;
      } catch (deliveryError) {
        console.error('Error syncing status to VubaVuba:', deliveryError);
      }
    }

    // emit websocket update & return updated order object
    emitOrderUpdate({ type: 'update', order });
    res.json(order);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }
});

// PATCH update item status (for kitchen)
router.patch('/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { id, itemId } = req.params;
    const { status } = req.body;

    // Get current order
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const items = typeof orderResult.rows[0].items === 'string' 
      ? JSON.parse(orderResult.rows[0].items) 
      : orderResult.rows[0].items;

    // Update item status
    const updatedItems = items.map((item: { id: string; startedAt?: string; completedAt?: string }) => {
      if (item.id === itemId) {
        return {
          ...item,
          status,
          startedAt: status === 'preparing' && !item.startedAt ? new Date().toISOString() : item.startedAt,
          completedAt: (status === 'ready' || status === 'served') && !item.completedAt ? new Date().toISOString() : item.completedAt
        };
      }
      return item;
    });

    // Check if all items are ready
    const allReady = updatedItems.every((item: { status: string }) => 
      item.status === 'ready' || item.status === 'served'
    );
    const anyPreparing = updatedItems.some((item: { status: string }) => 
      item.status === 'preparing' || item.status === 'ready'
    );

    // Update order status based on items
    let orderStatus = orderResult.rows[0].status;
    if (allReady) {
      orderStatus = 'ready';
    } else if (anyPreparing) {
      orderStatus = 'preparing';
    }

    const result = await pool.query(
      `UPDATE orders SET items = $1, status = $2, updated_at = $3 WHERE id = $4 RETURNING *`,
      [JSON.stringify(updatedItems), orderStatus, new Date().toISOString(), id]
    );

    const order = {
      ...result.rows[0],
      items: updatedItems
    };

    // Emit WebSocket event
    emitOrderUpdate({ type: 'update', order });

    res.json(order);
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error updating item status:', error);
      res.status(500).json({ error: 'Failed to update item status' });
    }
  }
});

// DELETE cancel order
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE orders SET status = 'cancelled', updated_at = $1 WHERE id = $2 RETURNING *`,
      [new Date().toISOString(), id]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const order = normalizeOrder(result.rows[0]);

    // Emit WebSocket event
    emitOrderUpdate({ type: 'status', order });

    res.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else {
      console.error('Error cancelling order:', error);
      res.status(500).json({ error: 'Failed to cancel order' });
    }
  }
});

export const ordersRouter = router;
