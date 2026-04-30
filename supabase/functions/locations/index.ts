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
  const path = url.pathname.replace(/^\/locations/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /locations
    if (req.method === 'GET' && path === '') {
      const { data: locs, error } = await db
        .from('inventory_locations')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name');
      if (error) return err(error.message);

      const { data: invRecs } = await db
        .from('inventory_records')
        .select('location_id, location, stock, low_stock_threshold')
        .eq('restaurant_id', restaurantId);

      const statsById = new Map<string, { totalItems: number; totalStock: number; lowStockItems: number }>();
      const statsByName = new Map<string, { totalItems: number; totalStock: number; lowStockItems: number }>();
      for (const rec of (invRecs ?? [])) {
        const key = rec.location_id || rec.location?.toLowerCase().trim();
        if (!key) continue;
        const target = rec.location_id ? statsById : statsByName;
        const s = target.get(key) ?? { totalItems: 0, totalStock: 0, lowStockItems: 0 };
        s.totalItems += 1;
        s.totalStock += rec.stock ?? 0;
        if ((rec.stock ?? 0) <= (rec.low_stock_threshold ?? 0)) s.lowStockItems += 1;
        target.set(key, s);
      }

      const result = (locs ?? []).map((loc: any) => {
        const s = statsById.get(loc.id) ?? statsByName.get(loc.name?.toLowerCase().trim()) ?? { totalItems: 0, totalStock: 0, lowStockItems: 0 };
        return { ...loc, total_items: s.totalItems, total_stock: s.totalStock, low_stock_items: s.lowStockItems };
      });
      return cors(result);
    }

    // GET /locations/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('inventory_locations')
        .select('*')
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // GET /locations/:id/stock
    const stockMatch = path.match(/^\/([^/]+)\/stock$/);
    if (req.method === 'GET' && stockMatch) {
      const { data } = await db
        .from('inventory_stock')
        .select('*, inventory_records(*, menu_items(name))')
        .eq('location_id', stockMatch[1])
        .eq('restaurant_id', restaurantId);
      return cors(data ?? []);
    }

    // GET /locations/:id/summary
    const summaryMatch = path.match(/^\/([^/]+)\/summary$/);
    if (req.method === 'GET' && summaryMatch) {
      const { data: loc } = await db
        .from('inventory_locations')
        .select('*')
        .eq('id', summaryMatch[1])
        .single();
      const { data: stock } = await db
        .from('inventory_stock')
        .select('quantity, inventory_records(menu_items(name))')
        .eq('location_id', summaryMatch[1]);
      return cors({ location: loc, stock: stock ?? [], totalItems: stock?.length ?? 0 });
    }

    // POST /locations
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await db
        .from('inventory_locations')
        .insert({ ...body, id, restaurant_id: restaurantId, is_active: true })
        .select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    // PUT /locations/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const { data, error } = await db
        .from('inventory_locations')
        .update(body)
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /locations/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('inventory_locations')
        .update({ is_active: false })
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId);
      return cors({ message: 'Location deactivated' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
