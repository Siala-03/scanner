import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate, requireRole } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/restaurants/, '');
  const db = admin();

  try {
    // GET /restaurants/public/:restaurantId — no auth
    const publicMatch = path.match(/^\/public\/([^/]+)$/);
    if (req.method === 'GET' && publicMatch) {
      const { data, error } = await db
        .from('restaurants')
        .select('id, name, address, phone, email, logo_url, currency, timezone')
        .eq('id', publicMatch[1])
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    const ctx = await authenticate(req);

    // GET /restaurants
    if (req.method === 'GET' && path === '') {
      requireRole(ctx, 'superadmin');
      const { data, error } = await db.from('restaurants').select('*').order('name');
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // GET /restaurants/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const id = idMatch[1];
      if (ctx.staffRole !== 'superadmin' && ctx.restaurantId !== id) {
        return err('Unauthorized', 403);
      }
      const { data, error } = await db.from('restaurants').select('*').eq('id', id).single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /restaurants
    if (req.method === 'POST' && path === '') {
      requireRole(ctx, 'superadmin');
      const body = await req.json();
      const id = `restaurant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await db
        .from('restaurants')
        .insert({ ...body, id })
        .select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    // PUT /restaurants/:id
    if (req.method === 'PUT' && idMatch) {
      const id = idMatch[1];
      if (ctx.staffRole !== 'superadmin' && ctx.restaurantId !== id) {
        return err('Unauthorized', 403);
      }
      const body = await req.json();
      const { data, error } = await db
        .from('restaurants')
        .update(body)
        .eq('id', id)
        .select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /restaurants/:id
    if (req.method === 'DELETE' && idMatch) {
      requireRole(ctx, 'superadmin');
      await db.from('restaurants').delete().eq('id', idMatch[1]);
      return cors({ message: 'Restaurant deleted' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
