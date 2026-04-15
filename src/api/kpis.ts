import { supabaseAdmin } from '../lib/supabase';
import { KPI, KPIWithProgress, StaffKPIProgress } from '../types';

function getRestaurantId(): string | null {
  if (typeof window === 'undefined') return null;

  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (authUserRaw) {
    try {
      const authUser = JSON.parse(authUserRaw);
      const fallbackId = authUser?.restaurantId || authUser?.restaurant_id;
      if (typeof fallbackId === 'string' && fallbackId.trim()) {
        localStorage.setItem('restaurantId', fallbackId);
        return fallbackId;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeRole(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getCurrentStaff(): { id: string; role: string } | null {
  try {
    const raw = localStorage.getItem('authUser');
    if (raw) {
      const u = JSON.parse(raw);
      const id = String(u?.id || '').trim();
      const role = normalizeRole(u?.role);
      if (id && role) return { id, role };
    }

    const id = String(localStorage.getItem('staffId') || '').trim();
    const role = normalizeRole(localStorage.getItem('staffRole'));
    if (id && role) return { id, role };

    return null;
  } catch {
    const id = String(localStorage.getItem('staffId') || '').trim();
    const role = normalizeRole(localStorage.getItem('staffRole'));
    if (id && role) return { id, role };
    return null;
  }
}

function getPeriodBounds(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'weekly') {
    const day = start.getDay(); // 0=Sun
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else {
    // monthly
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

/** Compute current metric value from real orders for a given staff + KPI */
async function computeProgress(
  kpi: KPI,
  staffId: string
): Promise<StaffKPIProgress> {
  const { start, end } = getPeriodBounds(kpi.period);

  let currentValue = 0;

  if (kpi.metric === 'orders_served' || kpi.metric === 'revenue' || kpi.metric === 'tables_served') {
    // Try assigned_waiter_id first, fall back to assigned_to (both column names exist)
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('total, table_number, status, assigned_waiter_id, assigned_to, created_at')
      .eq('restaurant_id', kpi.restaurant_id)
      .eq('status', 'served')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Waiter KPIs should be tied to the waiter's own fulfilled orders.
    // Supervisor/kitchen KPIs are operational and can reflect restaurant-wide activity.
    if (orders && normalizeRole(kpi.staff_role) === 'waiter') {
      orders.splice(
        0,
        orders.length,
        ...orders.filter(
          (o: any) =>
            o.assigned_waiter_id === staffId ||
            o.assigned_to === staffId ||
            o.created_by === staffId
        )
      );
    }

    const list = orders || [];
    if (kpi.metric === 'orders_served') {
      currentValue = list.length;
    } else if (kpi.metric === 'revenue') {
      currentValue = list.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
    } else if (kpi.metric === 'tables_served') {
      currentValue = new Set(list.map((o: any) => o.table_number)).size;
    }
  }
  // 'prep_time' and 'rating' require additional tables — leave at 0 for now

  return {
    id: 0,
    staffId,
    kpiId: kpi.id,
    currentValue,
    periodStart: start,
    periodEnd: end,
    achieved: currentValue >= kpi.target_value,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getKPIs(): Promise<KPI[]> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return [];

  const { data, error } = await supabaseAdmin
    .from('kpis')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('getKPIs error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    restaurant_id: row.restaurant_id,
    staff_role: row.staff_role,
    name: row.name,
    description: row.description,
    metric: row.metric,
    target_value: row.target_value,
    period: row.period,
    created_by: row.created_by,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    assigned_staff_ids: row.assigned_staff_ids || [],
  })) as KPI[];
}

export async function createKPI(kpi: {
  staffRole: string;
  name: string;
  description?: string;
  metric: string;
  targetValue: number;
  period: string;
  assignedStaffIds?: string[];
}): Promise<KPI> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new Error('No company selected');
  const staff = getCurrentStaff();

  const { data, error } = await supabaseAdmin
    .from('kpis')
    .insert({
      restaurant_id: restaurantId,
      staff_role: kpi.staffRole,
      name: kpi.name,
      description: kpi.description || null,
      metric: kpi.metric,
      target_value: kpi.targetValue,
      period: kpi.period,
      created_by: staff?.id || null,
      assigned_staff_ids: kpi.assignedStaffIds || [],
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    restaurant_id: data.restaurant_id,
    staff_role: data.staff_role,
    name: data.name,
    description: data.description,
    metric: data.metric,
    target_value: data.target_value,
    period: data.period,
    created_by: data.created_by,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
    assigned_staff_ids: data.assigned_staff_ids || [],
  } as KPI;
}

export async function getStaffKPIs(): Promise<KPIWithProgress[]> {
  const restaurantId = getRestaurantId();
  const staff = getCurrentStaff();
  if (!restaurantId || !staff) return [];

  const staffId = String(staff.id).trim();
  const staffRole = normalizeRole(staff.role);

  // Fetch KPIs where this staff's role matches OR they are in assigned_staff_ids
  const { data, error } = await supabaseAdmin
    .from('kpis')
    .select('*')
    .eq('restaurant_id', restaurantId);

  if (error) {
    console.warn('getStaffKPIs error:', error.message);
    return [];
  }

  const all = (data || []) as any[];
  // Filter to KPIs relevant to this staff member
  const relevant = all.filter((row) => {
    if (normalizeRole(row.staff_role) === staffRole) return true;

    const ids = Array.isArray(row.assigned_staff_ids) ? row.assigned_staff_ids : [];
    const normalizedIds = ids.map((id: unknown) => String(id).trim());
    return normalizedIds.includes(staffId);
  });

  if (relevant.length === 0) return [];

  // Compute live progress for each KPI
  const results = await Promise.all(
    relevant.map(async (row): Promise<KPIWithProgress> => {
      const kpi: KPI = {
        id: row.id,
        restaurant_id: row.restaurant_id,
        staff_role: row.staff_role,
        name: row.name,
        description: row.description,
        metric: row.metric,
        target_value: row.target_value,
        period: row.period,
        created_by: row.created_by,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        assigned_staff_ids: row.assigned_staff_ids || [],
      };
      const progress = await computeProgress(kpi, staffId);
      return { ...kpi, progress };
    })
  );

  return results;
}

export async function assignKPI(staffId: string, kpiId: number): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('kpis')
    .select('assigned_staff_ids')
    .eq('id', kpiId)
    .single();

  if (!existing) return;
  const ids: string[] = existing.assigned_staff_ids || [];
  if (!ids.includes(staffId)) ids.push(staffId);

  await supabaseAdmin
    .from('kpis')
    .update({ assigned_staff_ids: ids })
    .eq('id', kpiId);
}

export async function unassignKPI(staffId: string, kpiId: number): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('kpis')
    .select('assigned_staff_ids')
    .eq('id', kpiId)
    .single();

  if (!existing) return;
  const ids: string[] = (existing.assigned_staff_ids || []).filter((id: string) => id !== staffId);

  await supabaseAdmin
    .from('kpis')
    .update({ assigned_staff_ids: ids })
    .eq('id', kpiId);
}

export async function updateKPI(
  kpiId: number,
  kpi: {
    staffRole?: string;
    name?: string;
    description?: string;
    metric?: string;
    targetValue?: number;
    period?: string;
    assignedStaffIds?: string[];
  }
): Promise<KPI> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (kpi.staffRole !== undefined) payload.staff_role = kpi.staffRole;
  if (kpi.name !== undefined) payload.name = kpi.name;
  if (kpi.description !== undefined) payload.description = kpi.description;
  if (kpi.metric !== undefined) payload.metric = kpi.metric;
  if (kpi.targetValue !== undefined) payload.target_value = kpi.targetValue;
  if (kpi.period !== undefined) payload.period = kpi.period;
  if (kpi.assignedStaffIds !== undefined) payload.assigned_staff_ids = kpi.assignedStaffIds;

  const { data, error } = await supabaseAdmin
    .from('kpis')
    .update(payload)
    .eq('id', kpiId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    restaurant_id: data.restaurant_id,
    staff_role: data.staff_role,
    name: data.name,
    description: data.description,
    metric: data.metric,
    target_value: data.target_value,
    period: data.period,
    created_by: data.created_by,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
    assigned_staff_ids: data.assigned_staff_ids || [],
  } as KPI;
}

/** Progress is computed live from orders — this is a no-op */
export async function updateKPIProgress(_kpiId: number, _currentValue: number): Promise<void> {}

export async function deleteKPI(kpiId: number): Promise<{ success: boolean }> {
  const { error } = await supabaseAdmin
    .from('kpis')
    .delete()
    .eq('id', kpiId);

  if (error) throw error;
  return { success: true };
}
