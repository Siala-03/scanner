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
  const path = url.pathname.replace(/^\/suppliers/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /suppliers
    if (req.method === 'GET' && path === '') {
      const { data, error } = await db
        .from('suppliers')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name');
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // GET /suppliers/:id
    const idMatch = path.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('suppliers')
        .select('*')
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /suppliers
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const { data, error } = await db
        .from('suppliers')
        .insert({ ...body, restaurant_id: restaurantId })
        .select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    // PUT /suppliers/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const { data, error } = await db
        .from('suppliers')
        .update(body)
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId)
        .select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /suppliers/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('suppliers')
        .update({ is_active: false })
        .eq('id', idMatch[1])
        .eq('restaurant_id', restaurantId);
      return cors({ message: 'Supplier deactivated' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
