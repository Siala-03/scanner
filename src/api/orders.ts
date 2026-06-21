import { supabase } from '../lib/supabase';
import type { Order, CreateOrderInput, UpdateOrderStatusInput } from '../types/orders';
import { decrementInventoryForOrder, restoreInventoryForOrder } from './inventory';
import { fetchIpRestriction } from './restaurants';
import {
  getClientPublicIp,
  getCachedIpRestrictionSettings,
  cacheIpRestrictionSettings,
} from '../utils/ipRestriction';

const db = supabase;

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

function getStaffName(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('authUser');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const name = parsed?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

export interface OrderCancellationRequest {
  id: string;
  order_id: string;
  restaurant_id: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
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

const MERGEABLE_ORDER_STATUSES = ['pending', 'verified', 'preparing', 'ready', 'served'];

export async function findMergeableOpenOrder(
  tableNumber: number,
  restaurantId?: string,
  maxAgeMinutes = 120
): Promise<Order | null> {
  const restaurant = restaurantId || getRestaurantId();
  if (!restaurant || !Number.isInteger(tableNumber) || tableNumber <= 0 || tableNumber === 999) {
    return null;
  }

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();

  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurant)
    .eq('table_number', tableNumber)
    .in('status', MERGEABLE_ORDER_STATUSES)
    .gte('created_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(6);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const target = data.find((row: any) => {
    const paymentStatus = String(row?.payment_status ?? row?.paymentStatus ?? 'unpaid').toLowerCase();
    return paymentStatus !== 'confirmed';
  });

  return (target ?? null) as Order | null;
}

export async function createOrder(order: CreateOrderInput): Promise<Order> {
  const restaurantId = (order as any).restaurantId || getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const parseOrderItems = (raw: unknown): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const mergeNotes = (existing: unknown, incoming: unknown): string | null => {
    const left = typeof existing === 'string' ? existing.trim() : '';
    const right = typeof incoming === 'string' ? incoming.trim() : '';
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;
    if (left === right) return left;
    return `${left}\n${right}`;
  };

  // IP restriction — skip for online orders (table 999 = delivery/takeaway via QR)
  const isOnline = order.tableNumber === 999;
  if (!isOnline && typeof window !== 'undefined') {
    try {
      let ipSettings = getCachedIpRestrictionSettings(restaurantId);
      if (!ipSettings) {
        ipSettings = await fetchIpRestriction(restaurantId);
        cacheIpRestrictionSettings(restaurantId, ipSettings);
      }
      if (ipSettings.enabled && ipSettings.allowedIps.length > 0) {
        const clientIp = await getClientPublicIp();
        if (!clientIp || !ipSettings.allowedIps.includes(clientIp)) {
          throw new Error(
            'Orders can only be placed from within the restaurant network. ' +
            'Please connect to the restaurant Wi-Fi and try again.'
          );
        }
      }
    } catch (err: any) {
      // Re-throw IP restriction errors; swallow transient lookup failures
      if (err.message?.includes('restaurant network')) throw err;
      console.warn('[createOrder] IP restriction check failed (non-blocking):', err.message);
    }
  }

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
    category: (item as any).category || null,
    requires_kitchen: (item as any).requiresKitchen ?? null,
    status: 'pending'
  }));

  const total = items.reduce((sum, item) => sum + item.total_price, 0);

  // Resolve which waiter should be assigned to this order:
  // 1. If explicitly provided in input, use that.
  // 2. If the creator is a waiter, assign to them.
  // 3. Otherwise, look up the waiter assigned to the table.
  // 4. Fallback: always record the staffId as responsible so the order stays visible.
  let assignedWaiterId: string | null = (order as any).assignedWaiterId ?? null;
  if (!assignedWaiterId) {
    if (staffId && staffRole === 'waiter') {
      assignedWaiterId = staffId;
    } else if (order.tableNumber != null) {
      assignedWaiterId = await lookupAssignedWaiter(restaurantId, order.tableNumber);
    }
    // Final fallback: record the creator so the order is never orphaned.
    // Waiter portals use created_by as a secondary ownership check.
    if (!assignedWaiterId && staffId && staffRole === 'waiter') {
      assignedWaiterId = staffId;
    }
  }

  const isOnlineOrder = order.tableNumber === 999;

  const idempotencyKey = (order as any).idempotencyKey || crypto.randomUUID();

  const shouldAttemptTabMerge =
    Number.isInteger(order.tableNumber) &&
    Number(order.tableNumber) > 0 &&
    Number(order.tableNumber) !== 999 &&
    (order as any).allowMergeToOpenTab === true;

  if (shouldAttemptTabMerge) {
    const mergeTarget = await findMergeableOpenOrder(Number(order.tableNumber), restaurantId);

    if (mergeTarget) {

      const existingItems = parseOrderItems((mergeTarget as any).items);
      const existingSubtotal = Number((mergeTarget as any).subtotal ?? (mergeTarget as any).total ?? 0);
      const existingTax = Number((mergeTarget as any).tax ?? 0);
      const mergedSubtotal = existingSubtotal + total;
      const mergedTotal = mergedSubtotal + existingTax;
      const mergedNotes = mergeNotes((mergeTarget as any).notes, order.notes);

      const mergePayloads: Array<Record<string, unknown>> = [
        {
          items: [...existingItems, ...items],
          subtotal: mergedSubtotal,
          total: mergedTotal,
          notes: mergedNotes,
          status: 'pending',
          payment_status: 'unpaid',
          requires_kitchen: Boolean((mergeTarget as any).requires_kitchen ?? (mergeTarget as any).requiresKitchen) || Boolean(order.requiresKitchen),
          assigned_waiter_id: (mergeTarget as any).assigned_waiter_id || assignedWaiterId,
          updated_at: new Date().toISOString(),
        },
        {
          items: [...existingItems, ...items],
          subtotal: mergedSubtotal,
          total: mergedTotal,
          notes: mergedNotes,
          status: 'pending',
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        },
        {
          items: [...existingItems, ...items],
          total: mergedTotal,
          status: 'pending',
          updated_at: new Date().toISOString(),
        },
      ];

      for (const payload of mergePayloads) {
        let mergeQuery = db
          .from('orders')
          .update(payload)
          .eq('id', (mergeTarget as any).id);

        if ((mergeTarget as any).updated_at) {
          mergeQuery = mergeQuery.eq('updated_at', (mergeTarget as any).updated_at);
        }

        const mergeResult = await mergeQuery.select().maybeSingle();
        if (!mergeResult.error && mergeResult.data) {
          decrementInventoryForOrder(
            order.items.map(item => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
            { reference: String((mergeResult.data as any).order_number || orderNumber), performedBy: staffId || undefined }
          ).catch(err => console.warn('[createOrder] Inventory decrement failed after merge:', err));
          return mergeResult.data as Order;
        }

        // Optimistic lock miss (row changed) should fall back to creating a separate order safely.
        if (!mergeResult.error && !mergeResult.data) {
          break;
        }
      }
    }
  }

  // Full payload — includes optional columns that may or may not exist in the schema
  const fullPayload = {
    id: orderId,
    order_number: orderNumber,
    table_number: order.tableNumber,
    customer_name: order.customerName || null,
    customer_phone: (order as any).customerPhone || null,
    customer_email: (order as any).customerEmail || null,
    customer_address: (order as any).customerAddress || null,
    customer_id: order.customerId || null,
    status: 'pending',
    idempotency_key: idempotencyKey,
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
    is_online_order: isOnlineOrder,
  };

  let result = await db.from('orders').insert(fullPayload).select().single();

  // If the insert hit a unique-constraint violation (23505) on idempotency_key or id,
  // the order was already created — return it instead of throwing.
  if (result.error?.code === '23505') {
    const { data: existing } = await db
      .from('orders')
      .select('*')
      .or(`idempotency_key.eq.${idempotencyKey},id.eq.${orderId}`)
      .limit(1)
      .single();
    if (existing) return existing as Order;
  }

  // Fallback 1: remove assigned_waiter_id (may not exist in schema)
  if (result.error) {
    console.warn('[createOrder] Full insert failed, retrying without assigned_waiter_id:', result.error.message);
    const payload2 = {
      id: orderId,
      order_number: orderNumber,
      table_number: order.tableNumber,
      customer_name: order.customerName || null,
      customer_phone: (order as any).customerPhone || null,
      customer_id: order.customerId || null,
      status: 'pending',
      idempotency_key: idempotencyKey,
      items,
      subtotal: total,
      tax: 0,
      total,
      notes: order.notes || null,
      requires_kitchen: order.requiresKitchen ?? true,
      created_by: staffId,
      payment_status: 'unpaid',
      restaurant_id: restaurantId,
      is_online_order: isOnlineOrder,
    };
    result = await db.from('orders').insert(payload2).select().single();
    if (result.error?.code === '23505') {
      const { data: existing } = await db.from('orders').select('*').or(`idempotency_key.eq.${idempotencyKey},id.eq.${orderId}`).limit(1).single();
      if (existing) return existing as Order;
    }
  }

  // Fallback 2: also remove requires_kitchen (may not exist in schema)
  if (result.error) {
    console.warn('[createOrder] Retrying without requires_kitchen:', result.error.message);
    const payload3 = {
      id: orderId,
      order_number: orderNumber,
      table_number: order.tableNumber,
      customer_name: order.customerName || null,
      customer_id: order.customerId || null,
      status: 'pending',
      idempotency_key: idempotencyKey,
      items,
      total,
      notes: order.notes || null,
      created_by: staffId,
      restaurant_id: restaurantId,
    };
    result = await db.from('orders').insert(payload3).select().single();
    if (result.error?.code === '23505') {
      const { data: existing } = await db.from('orders').select('*').or(`idempotency_key.eq.${idempotencyKey},id.eq.${orderId}`).limit(1).single();
      if (existing) return existing as Order;
    }
  }

  // Fallback 3: absolute bare minimum
  if (result.error) {
    console.warn('[createOrder] Retrying with core-only columns:', result.error.message);
    const corePayload = {
      id: orderId,
      table_number: order.tableNumber,
      status: 'pending',
      idempotency_key: idempotencyKey,
      items,
      total,
      created_by: staffId,
      restaurant_id: restaurantId,
    };
    result = await db.from('orders').insert(corePayload).select().single();
    if (result.error?.code === '23505') {
      const { data: existing } = await db.from('orders').select('*').or(`idempotency_key.eq.${idempotencyKey},id.eq.${orderId}`).limit(1).single();
      if (existing) return existing as Order;
    }
  }

  if (result.error) throw result.error;

  // Decrement inventory stock for each ordered item (best-effort, does not block order creation)
  decrementInventoryForOrder(
    order.items.map(item => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
    { reference: orderNumber, performedBy: staffId || undefined }
  ).catch(err => console.warn('[createOrder] Inventory decrement failed:', err));

  return result.data as Order;
}

export async function updateOrderStatus(
  id: string,
  statusUpdate: UpdateOrderStatusInput
): Promise<Order> {
  const now = new Date().toISOString();
  const fullUpdates: Record<string, unknown> = {
    status: statusUpdate.status,
    updated_at: now,
  };

  if (statusUpdate.assignedTo !== undefined) {
    fullUpdates.assigned_to = statusUpdate.assignedTo;
    fullUpdates.assigned_waiter_id = statusUpdate.assignedTo;
  }

  if (statusUpdate.status === 'served' || (statusUpdate.status as string) === 'completed') {
    fullUpdates.completed_at = now;
  }

  if (statusUpdate.status === 'cancelled') {
    fullUpdates.cancelled_at = now;
    if (statusUpdate.cancellationReason) {
      fullUpdates.cancellation_note = statusUpdate.cancellationReason;
    }
    if (statusUpdate.cancelledBy) {
      fullUpdates.cancelled_by_name = statusUpdate.cancelledBy;
    }
  }

  let result = await db.from('orders').update(fullUpdates).eq('id', id).select().single();

  // If full update fails, try assignment-only variants before dropping waiter linkage.
  if (result.error) {
    console.warn('[updateOrderStatus] Full update failed, retrying with fallback variants:', result.error.message);

    if (statusUpdate.assignedTo !== undefined) {
      result = await db
        .from('orders')
        .update({
          status: statusUpdate.status,
          assigned_waiter_id: statusUpdate.assignedTo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
    }

    if (result.error && statusUpdate.assignedTo !== undefined) {
      result = await db
        .from('orders')
        .update({
          status: statusUpdate.status,
          assigned_to: statusUpdate.assignedTo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
    }

    if (result.error) {
      result = await db
        .from('orders')
        .update({ status: statusUpdate.status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    }
  }

  if (result.error) throw result.error;
  return result.data as Order;
}

export interface PaymentBreakdownEntry {
  method: string;   // 'Cash', 'Card', 'Mobile Money', 'Bank Transfer', etc.
  amount: number;
  reference?: string; // MOMO ref, card last-4, etc.
}

export async function confirmPayment(
  orderId: string,
  opts: {
    paymentType?: string;
    paymentBreakdown?: PaymentBreakdownEntry[];
    confirmedBy?: string;
    confirmedByName?: string;
    restaurantId?: string;
    note?: string;
  }
): Promise<Order> {
  const now = new Date().toISOString();

  // Full update — newest schema
  let result = await db
    .from('orders')
    .update({
      payment_status: 'confirmed',
      status: 'served',
      payment_confirmed_by: opts.confirmedBy || null,
      payment_confirmed_by_name: opts.confirmedByName || null,
      payment_confirmed_at: now,
      payment_type: opts.paymentType || null,
      payment_breakdown: opts.paymentBreakdown || null,
      payment_note: opts.note || null,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .select()
    .single();

  // Fallback 1: keep cashier ownership even if newer metadata columns are missing
  if (result.error) {
    result = await db
      .from('orders')
      .update({
        payment_status: 'confirmed',
        status: 'served',
        payment_confirmed_by: opts.confirmedBy || null,
        payment_confirmed_by_name: opts.confirmedByName || null,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', orderId)
      .select()
      .single();
  }

  // Fallback 2: payment_confirmed_by_name missing, still keep payment_confirmed_by
  if (result.error) {
    result = await db
      .from('orders')
      .update({
        payment_status: 'confirmed',
        status: 'served',
        payment_confirmed_by: opts.confirmedBy || null,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', orderId)
      .select()
      .single();
  }

  // Fallback 3: ownership columns unavailable in very old schemas
  if (result.error) {
    result = await db
      .from('orders')
      .update({ payment_status: 'confirmed', status: 'served', completed_at: now, updated_at: now })
      .eq('id', orderId)
      .select()
      .single();
  }

  // Fallback 4: payment_status missing or check mismatch — mark served only
  if (result.error?.code === 'PGRST204' || result.error?.code === '23514') {
    console.warn('[confirmPayment] payment_status unavailable, marking updated_at only:', result.error.message);
    result = await db
      .from('orders')
      .update({ status: 'served', completed_at: now, updated_at: now })
      .eq('id', orderId)
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

export async function cancelOrder(id: string, reason?: string): Promise<void> {
  // Fetch items before cancelling so we can restore inventory
  const { data: order } = await db
    .from('orders')
    .select('items, order_number')
    .eq('id', id)
    .single();

  let { error } = await db
    .from('orders')
    .update({
      status: 'cancelled',
      ...(reason ? { cancel_reason: reason } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // PGRST204 = column not in schema cache (migration 074 not yet applied) — retry without it
  if (error?.code === 'PGRST204') {
    ({ error } = await db
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id));
  }

  if (error) throw error;

  // Restore inventory for the cancelled items (best-effort, non-blocking)
  if (order) {
    const rawItems = typeof order.items === 'string'
      ? (() => { try { return JSON.parse(order.items); } catch { return []; } })()
      : (order.items ?? []);
    const items = Array.isArray(rawItems) ? rawItems : [];
    const restoreList = items
      .map((item: any) => ({
        menuItemId: item.menuItemId ?? item.menu_item_id ?? '',
        quantity: Number(item.quantity) || 0,
      }))
      .filter((i) => i.menuItemId && i.quantity > 0);

    if (restoreList.length > 0) {
      restoreInventoryForOrder(restoreList, {
        reference: order.order_number ?? id,
        reason: reason ?? 'Order cancelled',
      }).catch((err) => console.warn('[cancelOrder] Inventory restore failed:', err));
    }
  }
}

export async function requestOrderCancellation(
  orderId: string,
  opts?: { reason?: string; restaurantId?: string; requestedBy?: string; requestedByName?: string }
): Promise<OrderCancellationRequest> {
  const restaurantId = opts?.restaurantId || getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');

  const { data: existingPending, error: existingError } = await db
    .from('order_cancellation_requests')
    .select('*')
    .eq('order_id', orderId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingPending) return existingPending as OrderCancellationRequest;

  const now = new Date().toISOString();
  const payload = {
    id: `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    order_id: orderId,
    restaurant_id: restaurantId,
    status: 'pending' as const,
    reason: opts?.reason?.trim() || null,
    requested_by: opts?.requestedBy || getStaffId(),
    requested_by_name: opts?.requestedByName || getStaffName(),
    requested_at: now,
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    review_notes: null,
    updated_at: now,
  };

  const { data, error } = await db
    .from('order_cancellation_requests')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as OrderCancellationRequest;
}

export async function fetchCancellationRequestByOrderId(
  orderId: string
): Promise<OrderCancellationRequest | null> {
  const { data, error } = await db
    .from('order_cancellation_requests')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('fetchCancellationRequestByOrderId error:', error); return null; }
  return data as OrderCancellationRequest | null;
}

export async function fetchOrderCancellationRequests(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'all',
  restaurantId?: string
): Promise<OrderCancellationRequest[]> {
  const tenantId = restaurantId || getRestaurantId();
  if (!tenantId) return [];

  let query = db
    .from('order_cancellation_requests')
    .select('*')
    .eq('restaurant_id', tenantId)
    .order('created_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as OrderCancellationRequest[];
}

export async function approveOrderCancellationRequest(
  requestId: string,
  opts?: { reviewNotes?: string; reviewedBy?: string; reviewedByName?: string }
): Promise<OrderCancellationRequest> {
  const { data: request, error: requestError } = await db
    .from('order_cancellation_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (requestError) throw requestError;
  if (!request) throw new Error('Cancellation request not found');

  if (request.status === 'approved') return request as OrderCancellationRequest;
  if (request.status === 'rejected') throw new Error('Request is already rejected');

  await cancelOrder(request.order_id as string, request.reason ?? undefined);

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('order_cancellation_requests')
    .update({
      status: 'approved',
      reviewed_by: opts?.reviewedBy || getStaffId(),
      reviewed_by_name: opts?.reviewedByName || getStaffName(),
      reviewed_at: now,
      review_notes: opts?.reviewNotes?.trim() || null,
      updated_at: now,
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data as OrderCancellationRequest;
}

export async function rejectOrderCancellationRequest(
  requestId: string,
  opts?: { reviewNotes?: string; reviewedBy?: string; reviewedByName?: string }
): Promise<OrderCancellationRequest> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('order_cancellation_requests')
    .update({
      status: 'rejected',
      reviewed_by: opts?.reviewedBy || getStaffId(),
      reviewed_by_name: opts?.reviewedByName || getStaffName(),
      reviewed_at: now,
      review_notes: opts?.reviewNotes?.trim() || null,
      updated_at: now,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw error;
  return data as OrderCancellationRequest;
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