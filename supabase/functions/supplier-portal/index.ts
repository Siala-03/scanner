import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function resolveSupplierFromToken(token: string, db: any) {
  const [first, second] = token.split(':');
  if (!first || !second) throw Object.assign(new Error('Invalid token'), { status: 401 });
  const { data } = await db
    .from('supplier_users')
    .select('id, supplier_id')
    .eq('is_active', true)
    .or(`and(id.eq.${first},supplier_id.eq.${second}),and(id.eq.${second},supplier_id.eq.${first})`)
    .limit(1).maybeSingle();
  if (!data) throw Object.assign(new Error('Invalid token'), { status: 401 });
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/supplier-portal/, '');
  const db = admin();

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return err('Authorization required', 401);
    const { supplierId } = await resolveSupplierFromToken(token, db);

    // GET /supplier-portal/orders
    if (req.method === 'GET' && path === '/orders') {
      const status = url.searchParams.get('status');
      let query = db
        .from('purchase_orders')
        .select('*, restaurants(name)')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    // GET /supplier-portal/orders/:id
    const idMatch = path.match(/^\/orders\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const { data, error } = await db
        .from('purchase_orders')
        .select('*, restaurants(name)')
        .eq('id', idMatch[1])
        .eq('supplier_id', supplierId)
        .single();
      if (error) return err('Not found', 404);
      return cors(data);
    }

    // POST /supplier-portal/orders/:id/confirm
    const confirmMatch = path.match(/^\/orders\/([^/]+)\/confirm$/);
    if (req.method === 'POST' && confirmMatch) {
      const { data, error } = await db
        .from('purchase_orders')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', confirmMatch[1])
        .eq('supplier_id', supplierId)
        .select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // POST /supplier-portal/orders/:id/ship
    const shipMatch = path.match(/^\/orders\/([^/]+)\/ship$/);
    if (req.method === 'POST' && shipMatch) {
      const body = await req.json().catch(() => ({}));
      const { data, error } = await db
        .from('purchase_orders')
        .update({ status: 'shipped', shipped_at: new Date().toISOString(), tracking_number: body.trackingNumber ?? null })
        .eq('id', shipMatch[1])
        .eq('supplier_id', supplierId)
        .select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // GET /supplier-portal/stats
    if (req.method === 'GET' && path === '/stats') {
      const { data: orders } = await db
        .from('purchase_orders')
        .select('status, total_amount')
        .eq('supplier_id', supplierId);

      const stats = {
        total: orders?.length ?? 0,
        pending: orders?.filter((o: any) => o.status === 'pending').length ?? 0,
        confirmed: orders?.filter((o: any) => o.status === 'confirmed').length ?? 0,
        shipped: orders?.filter((o: any) => o.status === 'shipped').length ?? 0,
        received: orders?.filter((o: any) => o.status === 'received').length ?? 0,
        totalRevenue: orders?.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0) ?? 0,
      };
      return cors(stats);
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
