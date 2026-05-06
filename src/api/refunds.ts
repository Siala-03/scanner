import { supabase } from '../lib/supabase';

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function resolveTenantRestaurantId(fallback?: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const payload = token ? decodeJwtPayload(token) : null;
  const claim = payload?.restaurant_id;
  if (typeof claim === 'string' && claim.trim()) return claim.trim();
  return (fallback || '').trim();
}

export interface MinimartRefund {
  id: string;
  orderId?: string;
  restaurantId: string;
  refundedBy?: string;
  refundAmount: number;
  reason: string;
  items?: Array<{ name: string; qty: number; price: number }>;
  createdAt: string;
}

function normalize(raw: any): MinimartRefund {
  return {
    id:           raw.id,
    orderId:      raw.order_id ?? undefined,
    restaurantId: raw.restaurant_id,
    refundedBy:   raw.refunded_by ?? undefined,
    refundAmount: Number(raw.refund_amount ?? 0),
    reason:       raw.reason ?? '',
    items:        raw.items ?? undefined,
    createdAt:    raw.created_at,
  };
}

export async function createRefund(params: {
  orderId: string;
  restaurantId: string;
  refundedBy?: string;
  refundAmount: number;
  reason: string;
  items?: Array<{ name: string; qty: number; price: number }>;
}): Promise<MinimartRefund> {
  const { data, error } = await supabase
    .from('minimart_refunds')
    .insert({
      order_id:      params.orderId,
      restaurant_id: params.restaurantId,
      refunded_by:   params.refundedBy ?? null,
      refund_amount: Math.round(params.refundAmount * 100) / 100,
      reason:        params.reason,
      items:         params.items ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return normalize(data);
}

export async function fetchRefundsByOrder(orderId: string): Promise<MinimartRefund[]> {
  const { data, error } = await supabase
    .from('minimart_refunds')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map(normalize);
}

// ─── Refund Request (pending manager approval) ───────────────────────────────

export interface MinimartRefundRequest {
  id: string;
  restaurantId: string;
  orderId?: string;
  orderNumber?: string;
  requestedBy?: string;
  cashierName?: string;
  refundAmount: number;
  reason: string;
  items?: Array<{ name: string; qty: number; price: number }>;
  status: 'pending' | 'approved' | 'denied';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

function normalizeRequest(raw: any): MinimartRefundRequest {
  return {
    id:           raw.id,
    restaurantId: raw.restaurant_id,
    orderId:      raw.order_id ?? undefined,
    orderNumber:  raw.order_number ?? undefined,
    requestedBy:  raw.requested_by ?? undefined,
    cashierName:  raw.cashier_name ?? undefined,
    refundAmount: Number(raw.refund_amount ?? 0),
    reason:       raw.reason ?? '',
    items:        raw.items ?? undefined,
    status:       raw.status ?? 'pending',
    reviewedBy:   raw.reviewed_by ?? undefined,
    reviewedAt:   raw.reviewed_at ?? undefined,
    reviewNotes:  raw.review_notes ?? undefined,
    createdAt:    raw.created_at,
  };
}

/** Cashier submits a refund request — creates a 'pending' record for manager review. */
export async function requestRefund(params: {
  restaurantId: string;
  orderId: string;
  orderNumber?: string;
  requestedBy?: string;
  cashierName?: string;
  refundAmount: number;
  reason: string;
  items?: Array<{ name: string; qty: number; price: number }>;
}): Promise<MinimartRefundRequest> {
  const tenantRestaurantId = await resolveTenantRestaurantId(params.restaurantId);
  if (!tenantRestaurantId) {
    throw new Error('Unable to resolve restaurant context from your session. Please sign out and sign back in.');
  }

  const { data, error } = await supabase
    .from('minimart_refund_requests')
    .insert({
      restaurant_id:  tenantRestaurantId,
      order_id:       params.orderId,
      order_number:   params.orderNumber ?? null,
      requested_by:   params.requestedBy ?? null,
      cashier_name:   params.cashierName ?? null,
      refund_amount:  Math.round(params.refundAmount * 100) / 100,
      reason:         params.reason,
      items:          params.items ?? null,
      status:         'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return normalizeRequest(data);
}

/** Manager: fetch all refund requests for this restaurant, optionally filtered by status. */
export async function fetchRefundRequests(
  restaurantId: string,
  status?: 'pending' | 'approved' | 'denied',
): Promise<MinimartRefundRequest[]> {
  let q = supabase
    .from('minimart_refund_requests')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return [];
  return (data || []).map(normalizeRequest);
}

/** Manager approves a refund request — creates the actual refund record and marks request approved. */
export async function approveRefundRequest(params: {
  requestId: string;
  reviewedBy: string;
  reviewNotes?: string;
  restaurantId: string;
  orderId: string;
  refundedBy?: string;
  refundAmount: number;
  reason: string;
  items?: Array<{ name: string; qty: number; price: number }>;
}): Promise<void> {
  // 1. Create the actual refund record
  await createRefund({
    orderId:      params.orderId,
    restaurantId: params.restaurantId,
    refundedBy:   params.reviewedBy,
    refundAmount: params.refundAmount,
    reason:       params.reason,
    items:        params.items,
  });

  // 2. Mark the request as approved
  const { error } = await supabase
    .from('minimart_refund_requests')
    .update({
      status:       'approved',
      reviewed_by:  params.reviewedBy,
      reviewed_at:  new Date().toISOString(),
      review_notes: params.reviewNotes ?? null,
    })
    .eq('id', params.requestId);

  if (error) throw error;

  // 3. Mark the order as refunded so revenue calculations reflect the deduction
  await supabase
    .from('orders')
    .update({
      refund_amount: params.refundAmount,
      refund_reason: params.reason,
      refunded_at:   new Date().toISOString(),
      refunded_by:   params.reviewedBy,
    })
    .eq('id', params.orderId);
  // Best-effort: silently ignore if these columns don't exist yet in the schema

  // 4. Restore inventory stock for each refunded item
  if (params.items && params.items.length > 0) {
    // Fetch the original order items to resolve name → menu_item_id
    const { data: orderRow } = await supabase
      .from('orders')
      .select('items')
      .eq('id', params.orderId)
      .single();

    const orderItems: any[] = Array.isArray(orderRow?.items) ? orderRow.items : [];
    const nameToMenuItemId: Record<string, string> = {};
    orderItems.forEach((item: any) => {
      const name = item.menu_item_name || item.menuItemName || item.name || '';
      const id   = item.menu_item_id   || item.menuItemId   || '';
      if (name && id) nameToMenuItemId[name] = id;
    });

    await Promise.allSettled(
      params.items.map(async (refundItem) => {
        const menuItemId = nameToMenuItemId[refundItem.name];
        if (!menuItemId) return;

        const { data: rec } = await supabase
          .from('inventory_records')
          .select('stock')
          .eq('menu_item_id', menuItemId)
          .eq('restaurant_id', params.restaurantId)
          .maybeSingle();

        if (!rec) return;

        const stockBefore = rec.stock ?? 0;
        const newStock    = stockBefore + refundItem.qty;

        await supabase
          .from('inventory_records')
          .update({ stock: newStock, updated_at: new Date().toISOString() })
          .eq('menu_item_id', menuItemId)
          .eq('restaurant_id', params.restaurantId);

        // Log the stock movement for audit trail
        await supabase
          .from('stock_movements')
          .insert({
            id:            `mov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            menu_item_id:  menuItemId,
            type:          'return',
            qty:           refundItem.qty,
            stock_before:  stockBefore,
            balance_after: newStock,
            performed_by:  params.reviewedBy,
            reference:     params.orderId,
            notes:         `Refund approved: ${params.reason}`,
            restaurant_id: params.restaurantId,
          });
      })
    );
  }
}

/** Manager denies a refund request. */
export async function denyRefundRequest(params: {
  requestId: string;
  reviewedBy: string;
  reviewNotes?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('minimart_refund_requests')
    .update({
      status:       'denied',
      reviewed_by:  params.reviewedBy,
      reviewed_at:  new Date().toISOString(),
      review_notes: params.reviewNotes ?? null,
    })
    .eq('id', params.requestId);

  if (error) throw error;
}

