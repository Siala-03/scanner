import { supabase } from '../lib/supabase';

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
