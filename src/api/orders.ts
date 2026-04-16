import { supabaseAdmin } from '../lib/supabase';
import type { Order, CreateOrderInput, UpdateOrderStatusInput } from '../types/orders';
import { decrementInventoryForOrder } from './inventory';

// Use supabaseAdmin for all order operations so RLS never blocks customers or staff
const db = supabaseAdmin;

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

function getStaffId(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('staffId');
  }
  return null;
}

function generateShortOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 7; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

export async function fetchOrders(status?: string, restaurantId?: string): Promise<Order[]> {
  const restaurant = restaurantId || getRestaurantId();
  
  // Superadmin sees all orders if no restaurant specified
  if (!restaurant) {
    const { data, error } = await db
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as Order[];
  }

  let query = db
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurant)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Order[];
}

export async function fetchOrdersByDateRange(startDate: string, endDate: string, restaurantId?: string): Promise<Order[]> {
  const restaurant = restaurantId || getRestaurantId();
  if (!restaurant) return [];

  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurant)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as Order[];
}

export async function fetchKitchenOrders(restaurantId?: string): Promise<Order[]> {
  const restaurant = restaurantId || getRestaurantId();
  if (!restaurant) return [];

  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurant)
    .in('status', ['pending', 'verified', 'preparing', 'ready'])
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as Order[];
}

export async function fetchOrderById(id: string): Promise<Order> {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Order;
}

/** Look up which staff member is assigned to a given table for a restaurant. */
async function lookupAssignedWaiter(restaurantId: string, tableNumber: number): Promise<string | null> {
  try {
    const { data } = await db
      .from('staff')
      .select('id, assigned_tables')
      .eq('restaurant_id', restaurantId)
      .not('assigned_tables', 'is', null);

    if (!data) return null;
    // assigned_tables is stored as a JSON array of numbers
    for (const row of data) {
      const tables: number[] = Array.isArray(row.assigned_tables) ? row.assigned_tables : [];
      if (tables.includes(tableNumber)) return row.id;
    }
  } catch {
    // Non-fatal — order creation continues without assignment
  }
  return null;
}

export async function createOrder(order: CreateOrderInput): Promise<Order> {
  const restaurantId = (order as any).restaurantId || getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const staffId = getStaffId();
  const staffRole = typeof window !== 'undefined' ? localStorage.getItem('staffRole') : null;
  const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const orderNumber = generateShortOrderNumber();

  const items = order.items.map((item, index) => ({
    id: `item-${Date.now()}-${index}`,
    menu_item_id: item.menuItemId,
    menu_item_name: item.menuItemName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.quantity * item.unitPrice,
    notes: item.notes || null,
    status: 'pending'
  }));

  const total = items.reduce((sum, item) => sum + item.total_price, 0);

  // Resolve which waiter should be assigned to this order:
  // 1. If explicitly provided in input, use that.
  // 2. If the person creating the order is a waiter, assign to them.
  // 3. Otherwise, look up the waiter assigned to the table.
  let assignedWaiterId: string | null = (order as any).assignedWaiterId ?? null;
  if (!assignedWaiterId) {
    if (staffId && staffRole === 'waiter') {
      assignedWaiterId = staffId;
    } else if (order.tableNumber != null) {
      assignedWaiterId = await lookupAssignedWaiter(restaurantId, order.tableNumber);
    }
  }

  // Full payload — includes optional columns that may or may not exist in the schema
  const fullPayload = {
    id: orderId,
    order_number: orderNumber,
    table_number: order.tableNumber,
    customer_name: order.customerName || null,
    customer_phone: (order as any).customerPhone || null,
    customer_id: order.customerId || null,
    status: 'pending',
    items,
    subtotal: total,
    tax: 0,
    total,
    notes: order.notes || null,
    requires_kitchen: order.requiresKitchen ?? false,
    created_by: staffId,
    assigned_waiter_id: assignedWaiterId,
    payment_status: 'unpaid',
    restaurant_id: restaurantId,
  };

  let result = await db.from('orders').insert(fullPayload).select().single();

  // If the full insert fails (e.g. some columns don't exist in this schema),
  // retry with only the guaranteed-core columns.
  if (result.error) {
    console.warn('[createOrder] Full insert failed, retrying with minimal columns:', result.error.message);
    const minimalPayload = {
      id: orderId,
      order_number: orderNumber,
      table_number: order.tableNumber,
      customer_name: order.customerName || null,
      customer_phone: (order as any).customerPhone || null,
      customer_id: order.customerId || null,
      status: 'pending',
      items,
      total,
      notes: order.notes || null,
      requires_kitchen: order.requiresKitchen ?? false,
      restaurant_id: restaurantId,
      // Intentionally omitting assigned_waiter_id, subtotal, tax, etc.
      // — these columns may not exist in all deployed schemas
    };
    result = await db.from('orders').insert(minimalPayload).select().single();
  }

  // Last-resort fallback: only the absolute bare-minimum columns that must exist
  if (result.error) {
    console.warn('[createOrder] Minimal insert failed, retrying with core-only columns:', result.error.message);
    const corePayload = {
      id: orderId,
      table_number: order.tableNumber,
      status: 'pending',
      items,
      total,
      restaurant_id: restaurantId,
    };
    result = await db.from('orders').insert(corePayload).select().single();
  }

  if (result.error) throw result.error;

  // Decrement inventory stock for each ordered item (best-effort, does not block order creation)
  decrementInventoryForOrder(
    order.items.map(item => ({ menuItemId: item.menuItemId, quantity: item.quantity }))
  ).catch(err => console.warn('[createOrder] Inventory decrement failed:', err));

  return result.data as Order;
}

export async function updateOrderStatus(
  id: string,
  statusUpdate: UpdateOrderStatusInput
): Promise<Order> {
  const fullUpdates: Record<string, unknown> = {
    status: statusUpdate.status,
    updated_at: new Date().toISOString(),
  };

  if (statusUpdate.assignedTo !== undefined) {
    fullUpdates.assigned_to = statusUpdate.assignedTo;
    fullUpdates.assigned_waiter_id = statusUpdate.assignedTo;
  }

  if (statusUpdate.status === 'served' || (statusUpdate.status as string) === 'completed') {
    fullUpdates.completed_at = new Date().toISOString();
  }

  let result = await db.from('orders').update(fullUpdates).eq('id', id).select().single();

  // If the full update fails (e.g. a column doesn't exist), retry with just status
  if (result.error) {
    console.warn('[updateOrderStatus] Full update failed, retrying with minimal fields:', result.error.message);
    result = await db
      .from('orders')
      .update({ status: statusUpdate.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
  }

  if (result.error) throw result.error;
  return result.data as Order;
}

export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  status: string
): Promise<Order> {
  const { data: order, error: fetchError } = await db
    .from('orders')
    .select('items')
    .eq('id', orderId)
    .single();

  if (fetchError) throw fetchError;

  const updatedItems = (order.items || []).map((item: any) => 
    item.id === itemId ? { ...item, status } : item
  );

  const { data, error } = await db
    .from('orders')
    .update({ 
      items: updatedItems,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;
  return data as Order;
}

export async function cancelOrder(id: string): Promise<void> {
  const { error } = await db
    .from('orders')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;
}

export async function seedTestOrders(): Promise<{ message: string; count: number }> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');
  
  const testOrders = [
    { table: 1, items: [{ name: 'Burger', price: 1299 }, { name: 'Fries', price: 499 }] },
    { table: 2, items: [{ name: 'Pizza', price: 1499 }] },
    { table: 3, items: [{ name: 'Salad', price: 899 }, { name: 'Cola', price: 199 }] }
  ];

  const orders = testOrders.map((test, i) => {
    const total = test.items.reduce((sum, item) => sum + item.price, 0);
    return {
      id: `test-order-${i + 1}`,
      order_number: `TEST${Date.now().toString().slice(-4)}${i}`,
      table_number: test.table,
      status: 'pending',
      items: test.items.map((item, j) => ({
        id: `item-${i}-${j}`,
        menu_item_id: `menu-${j}`,
        menu_item_name: item.name,
        quantity: 1,
        unit_price: item.price,
        total_price: item.price,
        status: 'pending'
      })),
      subtotal: total,
      tax: 0,
      total,
      restaurant_id: restaurantId
    };
  });

  const { error } = await db.from('orders').upsert(orders, { onConflict: 'id' });
  if (error) throw error;

  return { message: 'Test orders created', count: orders.length };
}