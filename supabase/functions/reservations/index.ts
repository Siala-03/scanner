import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function uid() { return `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

// Convert a snake_case DB row to camelCase for the frontend
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = val;
  }
  return out;
}
function rowsToCamel(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(toCamel);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/reservations/, '');
  const db = admin();

  try {
    // Public routes (no auth required)
    // POST /reservations — customer booking
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const { restaurantId, customerName, customerPhone, customerEmail, partySize,
              reservationDate, reservationTime, durationMinutes, tableNumber, notes } = body;
      if (!restaurantId || !customerName || !customerPhone || !partySize || !reservationDate || !reservationTime) {
        return err('Missing required fields', 400);
      }
      const { data, error } = await db.from('reservations').insert({
        id: uid(),
        restaurant_id: restaurantId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail ?? null,
        party_size: partySize,
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        duration_minutes: durationMinutes ?? 90,
        table_number: tableNumber ?? null,
        notes: notes ?? null,
        status: 'pending',
      }).select('*').single();
      if (error) return err(error.message);
      return cors(toCamel(data as Record<string, unknown>), { status: 201 });
    }

    // GET /reservations/availability — public check
    if (req.method === 'GET' && path.startsWith('/availability')) {
      const restaurantId = url.searchParams.get('restaurantId') ?? '';
      const date = url.searchParams.get('date') ?? '';
      const { data } = await db.from('reservations')
        .select('reservation_time, duration_minutes, table_number, party_size')
        .eq('restaurant_id', restaurantId)
        .eq('reservation_date', date)
        .not('status', 'in', '("cancelled","no_show")');
      return cors(rowsToCamel((data ?? []) as Record<string, unknown>[]));
    }

    // Auth required for all remaining routes
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /reservations
    if (req.method === 'GET' && path === '') {
      const date = url.searchParams.get('date');
      const status = url.searchParams.get('status');
      let q = db.from('reservations').select('*').eq('restaurant_id', restaurantId).order('reservation_date').order('reservation_time');
      if (date) q = q.eq('reservation_date', date);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) return err(error.message);
      return cors(rowsToCamel((data ?? []) as Record<string, unknown>[]));
    }

    const idMatch = path.match(/^\/([^/]+)$/);

    // PUT /reservations/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.status !== undefined) update.status = body.status;
      if (body.tableNumber !== undefined) update.table_number = body.tableNumber;
      if (body.notes !== undefined) update.notes = body.notes;
      const { data, error } = await db.from('reservations').update(update)
        .eq('id', idMatch[1]).eq('restaurant_id', restaurantId).select('*').single();
      if (error) return err(error.message);
      return cors(toCamel(data as Record<string, unknown>));
    }

    // DELETE /reservations/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('reservations').update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', idMatch[1]).eq('restaurant_id', restaurantId);
      return cors({ message: 'Reservation cancelled' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
