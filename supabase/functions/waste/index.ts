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
  const path = url.pathname.replace(/^\/waste/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /waste
    if (req.method === 'GET' && path === '') {
      const { data, error } = await db
        .from('waste_entries')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('timestamp', { ascending: false });
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // GET /waste/summary/overview
    if (req.method === 'GET' && path === '/summary/overview') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await db
        .from('waste_entries')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gte('timestamp', thirtyDaysAgo);

      const totalCost = (data ?? []).reduce((s: number, r: any) => s + (r.total_cost ?? 0), 0);
      const totalQty = (data ?? []).reduce((s: number, r: any) => s + (r.qty ?? 0), 0);
      const byReason: Record<string, number> = {};
      const byItem: Record<string, { qty: number; cost: number }> = {};
      for (const row of (data ?? [])) {
        byReason[row.reason || 'Other'] = (byReason[row.reason || 'Other'] || 0) + (row.total_cost ?? 0);
        if (!byItem[row.menu_item_name]) byItem[row.menu_item_name] = { qty: 0, cost: 0 };
        byItem[row.menu_item_name].qty += row.qty ?? 0;
        byItem[row.menu_item_name].cost += row.total_cost ?? 0;
      }
      const topItems = Object.entries(byItem)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .slice(0, 5)
        .map(([name, v]) => ({ name, ...v }));

      return cors({ totalCost, totalQty, byReason, topItems, entries: data?.length ?? 0 });
    }

    // GET /waste/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('waste_entries')
        .select('*')
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /waste
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const id = `waste-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await db
        .from('waste_entries')
        .insert({ ...body, id, restaurant_id: restaurantId, timestamp: new Date().toISOString() })
        .select('*').single();
      if (error) return err(error.message);

      // Update inventory
      if (body.menu_item_id) {
        const { data: inv } = await db
          .from('inventory_records')
          .select('id, stock')
          .eq('menu_item_id', body.menu_item_id)
          .eq('restaurant_id', restaurantId)
          .maybeSingle();
        if (inv) {
          const newStock = Math.max(0, (inv.stock ?? 0) - (body.qty ?? 0));
          await db.from('inventory_records').update({ stock: newStock }).eq('id', inv.id);
          await db.from('stock_movements').insert({
            inventory_record_id: inv.id,
            restaurant_id: restaurantId,
            change_amount: -(body.qty ?? 0),
            reason: 'waste',
            new_stock: newStock,
            reference_id: id,
          }).maybeSingle();
        }
      }

      return cors(data, { status: 201 });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
