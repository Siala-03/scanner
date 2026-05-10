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
  const path = url.pathname
    .replace(/^\/functions\/v1\/reviews/, '')
    .replace(/^\/reviews/, '');
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
      return cors((data ?? []).map((r: any) => ({
        id: r.id,
        restaurantId: r.restaurant_id,
        orderId: r.order_id,
        tableNumber: r.table_number,
        rating: r.rating,
        comment: r.comment,
        customerName: r.customer_name,
        waiterId: r.waiter_id,
        waiterName: r.waiter_name,
        createdAt: r.created_at,
      })));
    }

    // ── Menu-item reviews (public) ──────────────────────────────────────────

    // GET /reviews/menu-items?restaurantId=X&menuItemId=Y&limit=20
    if (req.method === 'GET' && path === '/menu-items') {
      const restaurantId = url.searchParams.get('restaurantId');
      const menuItemId = url.searchParams.get('menuItemId');
      const limit = parseInt(url.searchParams.get('limit') ?? '20');
      if (!restaurantId) return err('restaurantId required', 400);

      let q = db.from('menu_item_reviews').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(limit);
      if (menuItemId) q = q.eq('menu_item_id', menuItemId);
      const { data, error } = await q;
      if (error) return err(error.message);
      return cors((data ?? []).map((r: any) => ({
        id: r.id, restaurantId: r.restaurant_id, menuItemId: r.menu_item_id,
        orderId: r.order_id, rating: r.rating, comment: r.comment,
        customerName: r.customer_name, createdAt: r.created_at,
      })));
    }

    // GET /reviews/menu-items/stats?restaurantId=X&menuItemIds=a,b,c
    if (req.method === 'GET' && path === '/menu-items/stats') {
      const restaurantId = url.searchParams.get('restaurantId');
      const menuItemIds = url.searchParams.get('menuItemIds');
      if (!restaurantId) return err('restaurantId required', 400);

      let q = db.from('menu_item_reviews').select('menu_item_id, rating').eq('restaurant_id', restaurantId);
      if (menuItemIds) q = q.in('menu_item_id', menuItemIds.split(',').filter(Boolean));
      const { data, error } = await q;
      if (error) return err(error.message);

      // Aggregate in-memory
      const agg: Record<string, { sum: number; count: number }> = {};
      (data ?? []).forEach((r: any) => {
        if (!agg[r.menu_item_id]) agg[r.menu_item_id] = { sum: 0, count: 0 };
        agg[r.menu_item_id].sum += r.rating;
        agg[r.menu_item_id].count += 1;
      });
      return cors(Object.entries(agg).map(([menuItemId, { sum, count }]) => ({
        menuItemId,
        avgRating: Math.round((sum / count) * 10) / 10,
        totalCount: count,
      })));
    }

    // POST /reviews/menu-items — public
    if (req.method === 'POST' && path === '/menu-items') {
      const body = await req.json();
      const { restaurantId, menuItemId, orderId, rating, comment, customerName } = body;
      if (!restaurantId || !menuItemId || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return err('restaurantId, menuItemId, and rating (1-5) are required', 400);
      }
      const id = `mir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const { data, error } = await db.from('menu_item_reviews').insert({
        id,
        restaurant_id: restaurantId,
        menu_item_id: menuItemId,
        order_id: orderId ?? null,
        rating,
        comment: comment ?? null,
        customer_name: customerName ?? null,
      }).select('*').single();
      if (error) return err(error.message);
      return cors({
        id: data.id, restaurantId: data.restaurant_id, menuItemId: data.menu_item_id,
        orderId: data.order_id, rating: data.rating, comment: data.comment,
        customerName: data.customer_name, createdAt: data.created_at,
      }, { status: 201 });
    }

    // DELETE /reviews/menu-items?id=X — auth required
    if (req.method === 'DELETE' && path === '/menu-items') {
      const ctx = await authenticate(req);
      const id = url.searchParams.get('id');
      if (!id) return err('id is required', 400);
      const { error } = await db
        .from('menu_item_reviews')
        .delete()
        .eq('id', id)
        .eq('restaurant_id', ctx.restaurantId);
      if (error) return err(error.message);
      return cors({ success: true });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
