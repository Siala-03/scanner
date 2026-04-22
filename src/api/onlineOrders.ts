import { supabase, callEdgeFn } from '../lib/supabase';
import { Order, OnlineQRCode } from '../types';

function generateId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateCodeToken(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const ONLINE_TABLE_NUMBER = 999;

// ── Staff operations (anon key + RLS) ────────────────────────────────────────

export async function createOnlineQRCode(restaurantId: string): Promise<OnlineQRCode> {
  const id = generateId();
  const codeToken = generateCodeToken();
  const shortLink = `${window.location.origin}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE_NUMBER}`;

  const { data, error } = await supabase
    .from('online_qr_codes')
    .insert([{
      id,
      restaurant_id: restaurantId,
      code_token: codeToken,
      qr_url: shortLink,
      short_link: shortLink,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    restaurantId: data.restaurant_id,
    codeToken: data.code_token,
    qrUrl: data.qr_url,
    shortLink: data.short_link,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getOrCreateOnlineQRCode(restaurantId: string): Promise<OnlineQRCode> {
  const correctLink = `${window.location.origin}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE_NUMBER}`;

  const { data: existing, error: fetchError } = await supabase
    .from('online_qr_codes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!fetchError && existing) {
    if (existing.short_link !== correctLink) {
      await supabase
        .from('online_qr_codes')
        .update({ short_link: correctLink, qr_url: correctLink, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return {
      id: existing.id,
      restaurantId: existing.restaurant_id,
      codeToken: existing.code_token,
      qrUrl: correctLink,
      shortLink: correctLink,
      isActive: existing.is_active,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }

  return createOnlineQRCode(restaurantId);
}

export async function regenerateOnlineQRCode(restaurantId: string): Promise<OnlineQRCode> {
  await supabase
    .from('online_qr_codes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId);

  return createOnlineQRCode(restaurantId);
}

export async function getOnlineOrders(restaurantId: string, status?: string): Promise<Order[]> {
  let query = supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_online_order', true)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return [];

  return (data || []).map(mapOrder);
}

export async function getPendingOnlineOrders(restaurantId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_online_order', true)
    .in('status', ['pending', 'verified', 'preparing'])
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data || []).map(mapOrder);
}

// ── Customer operations (Edge Functions — service key server-side) ────────────

/**
 * Customer-facing: validate a QR code token.
 * Calls the `customer-qr` Edge Function — no service key in browser.
 */
export async function getOnlineQRCodeByToken(codeToken: string): Promise<OnlineQRCode | null> {
  try {
    const data = await callEdgeFn('customer-qr', { params: { token: codeToken } });
    return {
      id: data.id,
      restaurantId: data.restaurant_id,
      codeToken: data.code_token,
      qrUrl: data.qr_url,
      shortLink: data.short_link,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Customer-facing: place an online order.
 * Calls the `customer-place-order` Edge Function — prices validated server-side.
 */
export async function createOnlineOrder(
  restaurantId: string,
  qrCodeId: string,
  customerName: string,
  customerPhone: string,
  customerEmail: string | null,
  customerAddress: string | null,
  items: any[],
  specialInstructions?: string
): Promise<Order> {
  const data = await callEdgeFn('customer-place-order', {
    method: 'POST',
    body: {
      restaurantId,
      qrCodeId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      items,
      specialInstructions,
    },
  });

  return mapOrder(data);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapOrder(o: any): Order {
  return {
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    customerAddress: o.customer_address,
    items: o.items || [],
    status: o.status,
    subtotal: o.subtotal,
    tax: o.tax,
    total: o.total,
    isOnlineOrder: o.is_online_order,
    onlineQRCodeId: o.online_qr_code_id,
    specialInstructions: o.notes,
    restaurantId: o.restaurant_id,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  } as any;
}
