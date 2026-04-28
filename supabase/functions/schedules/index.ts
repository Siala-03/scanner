import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function uid() { return `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/schedules/, '');
  const db = admin();

  try {
    const ctx = await authenticate(req);
    const restaurantId = ctx.restaurantId;

    // GET /schedules
    if (req.method === 'GET' && path === '') {
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const staffId = url.searchParams.get('staffId');
      let q = db.from('staff_schedules').select('*, staff(name, role)').eq('restaurant_id', restaurantId).order('shift_date').order('start_time');
      if (startDate) q = q.gte('shift_date', startDate);
      if (endDate) q = q.lte('shift_date', endDate);
      if (staffId) q = q.eq('staff_id', staffId);
      const { data, error } = await q;
      if (error) return err(error.message);
      const rows = (data ?? []).map((r: any) => ({
        id: r.id,
        restaurantId: r.restaurant_id,
        staffId: r.staff_id,
        staffName: r.staff?.name ?? null,
        staffRole: r.staff?.role ?? null,
        shiftDate: r.shift_date,
        startTime: r.start_time,
        endTime: r.end_time,
        notes: r.notes ?? null,
        createdAt: r.created_at,
      }));
      return cors(rows);
    }

    // POST /schedules
    if (req.method === 'POST' && path === '') {
      const body = await req.json();
      const { staffId, shiftDate, startTime, endTime, notes } = body;
      if (!staffId || !shiftDate || !startTime || !endTime) return err('staffId, shiftDate, startTime and endTime are required', 400);
      const { data: staffer } = await db.from('staff').select('name, role').eq('id', staffId).maybeSingle();
      const { data, error } = await db.from('staff_schedules').insert({
        id: uid(),
        restaurant_id: restaurantId,
        staff_id: staffId,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        notes: notes ?? null,
      }).select('*').single();
      if (error) return err(error.message);
      return cors({
        id: data.id,
        restaurantId: data.restaurant_id,
        staffId: data.staff_id,
        staffName: staffer?.name ?? null,
        staffRole: staffer?.role ?? null,
        shiftDate: data.shift_date,
        startTime: data.start_time,
        endTime: data.end_time,
        notes: data.notes,
        createdAt: data.created_at,
      }, { status: 201 });
    }

    const idMatch = path.match(/^\/([^/]+)$/);

    // PUT /schedules/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await req.json();
      const update: Record<string, unknown> = {};
      if (body.startTime) update.start_time = body.startTime;
      if (body.endTime) update.end_time = body.endTime;
      if (body.notes !== undefined) update.notes = body.notes;
      const { data, error } = await db.from('staff_schedules').update(update)
        .eq('id', idMatch[1]).eq('restaurant_id', restaurantId).select('*').single();
      if (error) return err(error.message);
      return cors(data);
    }

    // DELETE /schedules/:id
    if (req.method === 'DELETE' && idMatch) {
      await db.from('staff_schedules').delete().eq('id', idMatch[1]).eq('restaurant_id', restaurantId);
      return cors({ message: 'Shift deleted' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
