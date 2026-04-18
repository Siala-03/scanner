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
      const { data, error } = await db
        .from('inventory_locations')
        .select('*, inventory_stock(count)')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name');
      if (error) {
        const { data: d2 } = await db
          .from('inventory_locations')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('name');
        return cors(d2 ?? []);
      }
      return cors(data ?? []);
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
