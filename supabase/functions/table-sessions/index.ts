import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function makeSessionId(restaurantId: string, tableNumber: number): string {
  return `sess-${restaurantId}-${tableNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/table-sessions/, '');
  const db = admin();

  try {
    // GET /table-sessions/current?restaurantId=&tableNumber=
    if (req.method === 'GET' && path === '/current') {
      const restaurantId = url.searchParams.get('restaurantId')?.trim();
      const tableNumber = parseInt(url.searchParams.get('tableNumber') ?? '', 10);
      if (!restaurantId || !tableNumber) return err('restaurantId and tableNumber are required', 400);

      // Auto-close expired pending sessions
      await db.from('table_service_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending_close')
        .lte('pending_close_at', new Date().toISOString());

      const { data } = await db
        .from('table_service_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data || data.status === 'closed') return cors({ session: null });
      return cors({ session: data });
    }

    // POST /table-sessions/activity
    if (req.method === 'POST' && path === '/activity') {
      const body = await req.json();
      const restaurantId = String(body?.restaurantId || '').trim();
      const tableNumber = parseInt(String(body?.tableNumber ?? ''), 10);
      if (!restaurantId || !tableNumber) return err('restaurantId and tableNumber are required', 400);

      await db.from('table_service_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending_close')
        .lte('pending_close_at', new Date().toISOString());

      const { data: latest } = await db
        .from('table_service_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let session;
      const now = new Date().toISOString();
      if (!latest || latest.status === 'closed') {
        const { data } = await db
          .from('table_service_sessions')
          .insert({ id: makeSessionId(restaurantId, tableNumber), restaurant_id: restaurantId, table_number: tableNumber, status: 'active', started_at: now, last_activity_at: now, updated_at: now })
          .select('*').single();
        session = data;
      } else {
        const { data } = await db
          .from('table_service_sessions')
          .update({ status: 'active', last_activity_at: now, pending_close_at: null, updated_at: now })
          .eq('id', latest.id).select('*').single();
        session = data;
      }

      return cors({ session });
    }

    // POST /table-sessions/receipt-printed
    if (req.method === 'POST' && path === '/receipt-printed') {
      const body = await req.json();
      const restaurantId = String(body?.restaurantId || '').trim();
      const tableNumber = parseInt(String(body?.tableNumber ?? ''), 10);
      const pendingMinutes = Math.max(1, parseInt(String(body?.pendingCloseMinutes ?? '10'), 10));
      if (!restaurantId || !tableNumber) return err('restaurantId and tableNumber are required', 400);

      const now = new Date();
      const pendingAt = new Date(now.getTime() + pendingMinutes * 60 * 1000).toISOString();

      await db.from('table_service_sessions')
        .update({ status: 'closed', closed_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending_close')
        .lte('pending_close_at', now.toISOString());

      const { data: latest } = await db
        .from('table_service_sessions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .order('started_at', { ascending: false })
        .limit(1).maybeSingle();

      let sessionId = latest?.id;
      if (!latest || latest.status === 'closed') {
        const { data } = await db
          .from('table_service_sessions')
          .insert({ id: makeSessionId(restaurantId, tableNumber), restaurant_id: restaurantId, table_number: tableNumber, status: 'active', started_at: now.toISOString(), last_activity_at: now.toISOString(), updated_at: now.toISOString() })
          .select('id').single();
        sessionId = data?.id;
      }

      const { data: session } = await db
        .from('table_service_sessions')
        .update({ status: 'pending_close', receipt_printed_at: now.toISOString(), pending_close_at: pendingAt, last_activity_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', sessionId).select('*').single();

      return cors({ session });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
