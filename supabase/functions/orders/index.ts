import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let v = '';
  for (let i = 0; i < 7; i++) v += chars[Math.floor(Math.random() * chars.length)];
  return v;
}

function normalizeOrder(row: any) {
  const items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
  return { ...row, items, requires_kitchen: row.requires_kitchen ?? false };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/orders/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /orders
    if (req.method === 'GET' && path === '') {
      const status = url.searchParams.get('status');
      const date = url.searchParams.get('date');
      let query = db
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      if (date) query = query.gte('created_at', date).lte('created_at', date + 'T23:59:59');
      const { data, error } = await query;
      if (error) return err(error.message);
      return cors((data ?? []).map(normalizeOrder));
    }

    // GET /orders/kitchen
    if (req.method === 'GET' && path === '/kitchen') {
      const { data, error } = await db
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('requires_kitchen', true)
        .in('status', ['pending', 'preparing'])
        .order('created_at', { ascending: true });
      if (error) return err(error.message);
      return cors((data ?? []).map(normalizeOrder));
    }

    // GET /orders/kitchen/analytics
    if (req.method === 'GET' && path === '/kitchen/analytics') {
      const today = new Date().toISOString().slice(0, 10);
      const { data: orders } = await db
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', today);

      const total = orders?.length ?? 0;
      const served = orders?.filter((o: any) => o.status === 'served').length ?? 0;
      const itemCounts: Record<string, number> = {};
      for (const o of (orders ?? [])) {
        const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items ?? [];
        for (const item of items) {
          const name = item.menuItemName || item.menu_item_name || 'Unknown';
          itemCounts[name] = (itemCounts[name] || 0) + (item.quantity || 1);
        }
      }
      const topItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      return cors({ total, served, topItems });
    }

    // GET /orders/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('orders')
        .select('*')
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .single();
      if (error) return err('Not found', 404);
      return cors(normalizeOrder(data));
    }

    // POST /orders
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const id = `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const order_number = generateOrderNumber();
      const requires_kitchen = body.items?.some((item: any) => item.requiresKitchen ?? true) ?? true;

      const { data, error } = await db
        .from('orders')
        .insert({
          id,
          order_number,
          restaurant_id: restaurantId,
          table_number: body.tableNumber ?? body.table_number,
          customer_name: body.customerName ?? body.customer_name,
          status: 'pending',
          items: body.items,
          subtotal: body.subtotal,
          tax: body.tax,
          total: body.total,
          notes: body.notes ?? '',
          requires_kitchen,
          waiter_id: ctx.staffId,
        })
        .select('*').single();
      if (error) return err(error.message);
      return cors(normalizeOrder(data), { status: 201 });
    }

    // PUT /orders/:id/status
    const statusMatch = path.match(/^\/([^/]+)\/status$/);
    if (req.method === 'PUT' && statusMatch) {
      const { status } = await req.json();
      const updateData: any = { status };
      if (status === 'served') updateData.served_at = new Date().toISOString();
      if (status === 'preparing') updateData.preparing_at = new Date().toISOString();

      const { data, error } = await db
        .from('orders')
        .update(updateData)
        .eq('id', statusMatch[1])
        .eq('restaurant_id', restaurantId)
        .select('*').single();
      if (error) return err(error.message);

      // Award loyalty points on served
      if (status === 'served' && data.customer_phone) {
        const { data: customer } = await db
          .from('customers')
          .select('id, total_points')
          .eq('phone', data.customer_phone)
          .eq('restaurant_id', restaurantId)
          .maybeSingle();
        if (customer) {
          const points = Math.floor((data.total ?? 0) / 100);
          if (points > 0) {
            await db.from('loyalty_transactions').insert({
              id: `tx-${Date.now()}`,
              customer_id: customer.id,
              order_id: data.id,
              restaurant_id: restaurantId,
              transaction_type: 'earn',
              points,
              description: `Points earned from order ${data.order_number}`,
            });
            await db.from('customers').update({ total_points: (customer.total_points ?? 0) + points }).eq('id', customer.id);
          }
        }
      }

      return cors(normalizeOrder(data));
    }

    // PATCH /orders/:id/items/:itemId
    const itemStatusMatch = path.match(/^\/([^/]+)\/items\/([^/]+)$/);
    if (req.method === 'PATCH' && itemStatusMatch) {
      const { status } = await req.json();
      const { data: order } = await db
        .from('orders')
        .select('items')
        .eq('id', itemStatusMatch[1])
        .single();
      if (!order) return err('Order not found', 404);

      const items = (typeof order.items === 'string' ? JSON.parse(order.items) : order.items ?? [])
        .map((item: any) =>
          (item.id || item.menuItemId) === itemStatusMatch[2] ? { ...item, status } : item
        );

      const { data, error } = await db
        .from('orders')
        .update({ items })
        .eq('id', itemStatusMatch[1])
        .select('*').single();
      if (error) return err(error.message);
      return cors(normalizeOrder(data));
    }

    // DELETE /orders/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('orders')
        .update({ status: 'cancelled' })
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId);
      return cors({ message: 'Order cancelled' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
