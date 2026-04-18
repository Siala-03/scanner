import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/purchase-orders/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /purchase-orders
    if (req.method === 'GET' && path === '') {
      const status = url.searchParams.get('status');
      let query = db
        .from('purchase_orders')
        .select('*, suppliers(name)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // GET /purchase-orders/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('purchase_orders')
        .select('*, suppliers(name)')
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /purchase-orders
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const id = `po-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await db
        .from('purchase_orders')
        .insert({ ...body, id, restaurant_id: restaurantId, status: 'pending' })
        .select('*, suppliers(name)').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    // PUT /purchase-orders/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const { data, error } = await db
        .from('purchase_orders')
        .update(body)
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .select('*, suppliers(name)').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // POST /purchase-orders/:id/receive
    const receiveMatch = path.match(/^\/([^/]+)\/receive$/);
    if (req.method === 'POST' && receiveMatch) {
      const poId = receiveMatch[1];
      const { data: po } = await db
        .from('purchase_orders')
        .select('*')
        .eq('id', poId)
        .eq('restaurant_id', restaurantId)
        .single();
      if (!po) return err('Purchase order not found', 404);

      // Mark PO as received
      await db.from('purchase_orders')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', poId);

      // Update inventory for each item
      const items = Array.isArray(po.items) ? po.items : JSON.parse(po.items || '[]');
      for (const item of items) {
        const menuItemId = item.menuItemId || item.menu_item_id;
        const qty = item.quantity || item.qty || 0;
        if (!menuItemId || !qty) continue;

        const { data: inv } = await db
          .from('inventory_records')
          .select('id, stock')
          .eq('menu_item_id', menuItemId)
          .eq('restaurant_id', restaurantId)
          .maybeSingle();

        if (inv) {
          const newStock = (inv.stock ?? 0) + qty;
          await db.from('inventory_records')
            .update({ stock: newStock })
            .eq('id', inv.id);
          await db.from('stock_movements').insert({
            inventory_record_id: inv.id,
            restaurant_id: restaurantId,
            change_amount: qty,
            reason: 'purchase_order_received',
            new_stock: newStock,
            reference_id: poId,
          }).maybeSingle();
        }
      }

      return cors({ message: 'Purchase order received and inventory updated' });
    }

    // DELETE /purchase-orders/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('purchase_orders').delete().eq('id', idMatch[1]).eq('restaurant_id', restaurantId);
      return cors({ message: 'Deleted' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
