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
  const path = url.pathname.replace(/^\/inventory/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /inventory
    if (req.method === 'GET' && path === '') {
      const { data, error } = await db
        .from('inventory_records')
        .select('*, menu_items(id, name, category, price)')
        .eq('restaurant_id', restaurantId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback without is_deleted filter
        const { data: d2 } = await db
          .from('inventory_records')
          .select('*, menu_items(id, name, category, price)')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false });
        return cors(d2 ?? []);
      }
      return cors(data ?? []);
    }

    // GET /inventory/alerts/low-stock
    if (req.method === 'GET' && path === '/alerts/low-stock') {
      const { data } = await db
        .from('inventory_records')
        .select('*, menu_items(name)')
        .eq('restaurant_id', restaurantId)
        .filter('stock', 'lte', 'low_stock_threshold');
      return cors(data ?? []);
    }

    // GET /inventory/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('inventory_records')
        .select('*, menu_items(id, name, category, price)')
        .eq('id', idMatch[1])
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /inventory
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const { data, error } = await db
        .from('inventory_records')
        .insert({ ...body, restaurant_id: restaurantId })
        .select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    // PUT /inventory/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const { data, error } = await db
        .from('inventory_records')
        .update(body)
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /inventory/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('inventory_records')
        .update({ is_deleted: true })
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId);
      return cors({ message: 'Deleted' });
    }

    // PATCH /inventory/:id/adjust
    const adjustMatch = path.match(/^\/([^/]+)\/adjust$/);
    if (req.method === 'PATCH' && adjustMatch) {
      const { adjustment, reason } = await req.json();
      const { data: current } = await db
        .from('inventory_records')
        .select('stock')
        .eq('id', adjustMatch[1])
        .single();
      const newStock = (current?.stock ?? 0) + adjustment;
      const { data, error } = await db
        .from('inventory_records')
        .update({ stock: newStock })
        .eq('id', adjustMatch[1])
        .eq('restaurant_id', restaurantId)
        .select('*').single();
      if (error) return err(error.message);
      // Record movement
      await db.from('stock_movements').insert({
        inventory_record_id: adjustMatch[1],
        restaurant_id: restaurantId,
        change_amount: adjustment,
        reason: reason || 'manual_adjustment',
        new_stock: newStock,
      }).select().maybeSingle();
      return cors(data);
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
