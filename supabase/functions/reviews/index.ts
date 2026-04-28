import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function uid() { return `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/reviews/, '');
  const db = admin();

  try {
    // POST /reviews — public (customer submits review)
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const { restaurantId, orderId, tableNumber, rating, comment, customerName, waiterId } = body;
      if (!restaurantId || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return err('restaurantId and rating (1-5) are required', 400);
      }

      // Optionally look up waiter name
      let waiterName: string | null = null;
      if (waiterId) {
        const { data: staffer } = await db.from('staff').select('name').eq('id', waiterId).maybeSingle();
        waiterName = staffer?.name ?? null;
      }

      const { data, error } = await db.from('reviews').insert({
        id: uid(),
        restaurant_id: restaurantId,
        order_id: orderId ?? null,
        table_number: tableNumber ?? null,
        rating,
        comment: comment ?? null,
        customer_name: customerName ?? null,
        waiter_id: waiterId ?? null,
        waiter_name: waiterName,
      }).select('*').single();
      if (error) return err(error.message);
      return cors(data, { status: 201 });
    }

    // GET /reviews/stats — auth required
    if (req.method === 'GET' && path === '/stats') {
      const ctx = await authenticate(req);
      const restaurantId = ctx.restaurantId;
      const { data } = await db.from('reviews').select('rating, created_at').eq('restaurant_id', restaurantId);
      const rows = data ?? [];
      const total = rows.length;
      const avgRating = total > 0 ? Math.round((rows.reduce((s: number, r: any) => s + r.rating, 0) / total) * 10) / 10 : null;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const thisMonth = rows.filter((r: any) => r.created_at >= monthStart).length;
      const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      rows.forEach((r: any) => { dist[r.rating] = (dist[r.rating] ?? 0) + 1; });
      const distribution = [5, 4, 3, 2, 1].map(rating => ({ rating, count: dist[rating] ?? 0 }));
      return cors({ total, avgRating, thisMonth, distribution });
    }

    // GET /reviews — auth required
    if (req.method === 'GET' && path === '') {
      const ctx = await authenticate(req);
      const restaurantId = ctx.restaurantId;
      const rating = url.searchParams.get('rating');
      const waiterId = url.searchParams.get('waiterId');
      const limit = parseInt(url.searchParams.get('limit') ?? '50');
      let q = db.from('reviews').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(limit);
      if (rating) q = q.eq('rating', parseInt(rating));
      if (waiterId) q = q.eq('waiter_id', waiterId);
      const { data, error } = await q;
      if (error) return err(error.message);
      return cors(data ?? []);
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
