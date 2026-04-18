import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface StaffContext {
  staffId: string;
  staffRole: string;
  restaurantId: string;
}

export async function authenticate(req: Request): Promise<StaffContext> {
  const staffId = req.headers.get('x-staff-id');
  if (!staffId) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data, error } = await admin
    .from('staff')
    .select('id, role, restaurant_id')
    .eq('id', staffId)
    .maybeSingle();

  if (error || !data) throw Object.assign(new Error('Invalid authentication'), { status: 401 });

  return { staffId: data.id, staffRole: data.role, restaurantId: data.restaurant_id };
}

export function requireRole(ctx: StaffContext, ...roles: string[]): void {
  if (!roles.includes(ctx.staffRole)) {
    throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
  }
}
