import { supabaseAdmin } from '../lib/supabase';
import { Order, OnlineQRCode } from '../types';

function generateId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Generate a unique token for QR code (short, URL-friendly)
 */
function generateCodeToken(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Create a new online ordering QR code for a restaurant
 */
export const ONLINE_TABLE_NUMBER = 999;

export async function createOnlineQRCode(restaurantId: string): Promise<OnlineQRCode> {
  const id = generateId();
  const codeToken = generateCodeToken();
  const shortLink = `${window.location.origin}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE_NUMBER}`;
  const qrUrl = shortLink;

  const { data, error } = await supabaseAdmin
    .from('online_qr_codes')
    .insert([
      {
        id,
        restaurant_id: restaurantId,
        code_token: codeToken,
        qr_url: qrUrl,
        short_link: shortLink,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Failed to create online QR code:', error);
    throw error;
  }

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

/**
 * Get the online QR code for a restaurant (create if doesn't exist)
 */
export async function getOrCreateOnlineQRCode(restaurantId: string): Promise<OnlineQRCode> {
  // First, try to get existing active QR code
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('online_qr_codes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!fetchError && existing) {
    return {
      id: existing.id,
      restaurantId: existing.restaurant_id,
      codeToken: existing.code_token,
      qrUrl: existing.qr_url,
      shortLink: existing.short_link,
      isActive: existing.is_active,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }

  // If not found, create a new one
  return createOnlineQRCode(restaurantId);
}

/**
 * Regenerate a QR code (deactivate old, create new)
 */
export async function regenerateOnlineQRCode(restaurantId: string): Promise<OnlineQRCode> {
  // Deactivate all previous codes
  await supabaseAdmin
    .from('online_qr_codes')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('restaurant_id', restaurantId);

  // Create new code
  return createOnlineQRCode(restaurantId);
}

/**
 * Get online QR code by token
 */
export async function getOnlineQRCodeByToken(codeToken: string): Promise<OnlineQRCode | null> {
  const { data, error } = await supabaseAdmin
    .from('online_qr_codes')
    .select('*')
    .eq('code_token', codeToken)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error('QR code not found or inactive:', error);
    return null;
  }

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

/**
 * Create an online order from QR code
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
  const id = generateId();
  const orderNumber = `ONLINE-${Date.now().toString().slice(-8)}`;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 0), 0);
  const tax = Math.round(subtotal * 0.1); // 10% tax
  const total = subtotal + tax;

  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert([
      {
        id,
        order_number: orderNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_address: customerAddress,
        items: items,
        status: 'pending',
        subtotal,
        tax,
        total,
        is_online_order: true,
        online_qr_code_id: qrCodeId,
        notes: specialInstructions,
        restaurant_id: restaurantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Failed to create online order:', error);
    throw error;
  }

  return {
    id: data.id,
    orderNumber: data.order_number,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    customerPhone: data.customer_phone,
    customerAddress: data.customer_address,
    items: data.items || [],
    status: data.status,
    subtotal: data.subtotal,
    tax: data.tax,
    total: data.total,
    isOnlineOrder: data.is_online_order,
    onlineQRCodeId: data.online_qr_code_id,
    specialInstructions: data.notes,
    restaurantId: data.restaurant_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Get all online orders for a restaurant
 */
export async function getOnlineOrders(
  restaurantId: string,
  status?: string
): Promise<Order[]> {
  let query = supabaseAdmin
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_online_order', true)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch online orders:', error);
    return [];
  }

  return (data || []).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    items: order.items || [],
    status: order.status,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    isOnlineOrder: order.is_online_order,
    onlineQRCodeId: order.online_qr_code_id,
    specialInstructions: order.notes,
    restaurantId: order.restaurant_id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  }));
}

/**
 * Get pending online orders for display in supervisor/waiter dashboard
 */
export async function getPendingOnlineOrders(restaurantId: string): Promise<Order[]> {
  const statuses = ['pending', 'verified', 'preparing'];
  let query = supabaseAdmin
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_online_order', true)
    .in('status', statuses)
    .order('created_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch pending online orders:', error);
    return [];
  }

  return (data || []).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    items: order.items || [],
    status: order.status,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    isOnlineOrder: order.is_online_order,
    onlineQRCodeId: order.online_qr_code_id,
    specialInstructions: order.notes,
    restaurantId: order.restaurant_id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  }));
}
