import { supabaseAdmin } from '../lib/supabase';
import type { Order, CreateOrderInput, UpdateOrderStatusInput } from '../types/orders';

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

export async function createOrder(order: CreateOrderInput): Promise<Order> {
  const restaurantId = (order as any).restaurantId || getRestaurantId();
  if (!restaurantId) throw new Error('No restaurant selected');
  
  const staffId = getStaffId();
  const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const orderNumber = Date.now().toString().slice(-6);

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

  // Full payload — includes optional columns that may or may not exist in the schema
  const fullPayload = {
    id: orderId,
    order_number: orderNumber,
    table_number: order.tableNumber,
    customer_name: order.customerName || null,
    customer_phone: order.customerPhone || null,
    customer_id: order.customerId || null,
    status: 'pending',
    items,
    subtotal: total,
    tax: 0,
    total,
    notes: order.notes || null,
    requires_kitchen: order.requiresKitchen ?? false,
    created_by: staffId,
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
      table_number: order.tableNumber,
      customer_name: order.customerName || null,
      customer_phone: order.customerPhone || null,
      customer_id: order.customerId || null,
      status: 'pending',
      items,
      total,
      notes: order.notes || null,
      restaurant_id: restaurantId,
    };
    result = await db.from('orders').insert(minimalPayload).select().single();
  }

  if (result.error) throw result.error;
  return result.data as Order;
}

export async function updateOrderStatus(
  id: string,
  statusUpdate: UpdateOrderStatusInput
): Promise<Order> {
  const updates: Record<string, unknown> = {
    status: statusUpdate.status,
    updated_at: new Date().toISOString()
  };

  if (statusUpdate.assignedTo !== undefined) {
    updates.assigned_to = statusUpdate.assignedTo;
    updates.assigned_waiter_id = statusUpdate.assignedTo;
  }

  if (statusUpdate.status === 'served' || statusUpdate.status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await db
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Order;
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
  if (!restaurantId) throw new Error('No restaurant selected');
  
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