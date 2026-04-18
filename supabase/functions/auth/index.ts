import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate, requireRole } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function mapStaff(row: any) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    isOnDuty: row.is_on_duty,
    assignedTables: row.assigned_tables ?? [],
    performance: row.performance,
    hireDate: row.hire_date,
    restaurantId: row.restaurant_id,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth/, '');
  const db = admin();

  try {
    // POST /auth/login
    if (req.method === 'POST' && path === '/login') {
      const { username, password, restaurantId } = await req.json();
      if (!username || !password) return err('Username and password required', 400);

      let query = db
        .from('staff_credentials')
        .select('staff_id, password_hash, restaurant_id, staff(role)')
        .eq('username', username);

      if (restaurantId) query = query.eq('restaurant_id', restaurantId);

      const { data: creds, error: credErr } = await query.limit(1).maybeSingle();

      if (credErr || !creds) return err('Invalid username or password', 401);

      const valid = await bcrypt.compare(password, creds.password_hash);
      if (!valid) return err('Invalid username or password', 401);

      const { data: staff } = await db
        .from('staff')
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .eq('id', creds.staff_id)
        .single();

      if (!staff) return err('User not found', 401);
      return cors({ staff: mapStaff(staff) });
    }

    // POST /auth/signup
    if (req.method === 'POST' && path === '/signup') {
      const body = await req.json();
      const { name, email, phone, role, username, password, restaurantId } = body;
      if (!name || !email || !phone || !role || !username || !password) {
        return err('All fields are required', 400);
      }

      let callerRole: string | null = null;
      let callerRestaurantId: string | null = null;
      const staffId = req.headers.get('x-staff-id');
      if (staffId) {
        const { data: caller } = await db
          .from('staff')
          .select('role, restaurant_id')
          .eq('id', staffId)
          .maybeSingle();
        callerRole = caller?.role ?? null;
        callerRestaurantId = caller?.restaurant_id ?? null;
      }

      const targetRestaurantId = restaurantId || callerRestaurantId;
      if (!targetRestaurantId) return err('restaurantId is required', 400);

      if (callerRole === 'manager') {
        if (!['waiter', 'supervisor', 'kitchen'].includes(role)) {
          return err('Managers can only create waiter, supervisor, or kitchen staff', 403);
        }
        if (restaurantId && restaurantId !== callerRestaurantId) {
          return err('Managers can only create accounts for their restaurant', 403);
        }
      } else if (!callerRole && role !== 'manager') {
        return err('Please authenticate as manager to create an account', 403);
      }

      const { data: existingUser } = await db
        .from('staff_credentials')
        .select('staff_id')
        .eq('username', username)
        .eq('restaurant_id', targetRestaurantId)
        .maybeSingle();
      if (existingUser) return err('Username already taken in this restaurant', 409);

      const { data: existingEmail } = await db
        .from('staff')
        .select('id')
        .eq('email', email)
        .eq('restaurant_id', targetRestaurantId)
        .maybeSingle();
      if (existingEmail) return err('Email already registered in this restaurant', 409);

      const hash = await bcrypt.hash(password, 10);
      const id = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const { data: newStaff, error: staffErr } = await db
        .from('staff')
        .insert({
          id, name, role, email, phone,
          is_on_duty: true,
          assigned_tables: [],
          performance: [],
          restaurant_id: targetRestaurantId,
        })
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .single();

      if (staffErr) return err(staffErr.message, 500);

      const { error: credErr } = await db
        .from('staff_credentials')
        .insert({ staff_id: id, username, password_hash: hash, restaurant_id: targetRestaurantId });

      if (credErr) {
        await db.from('staff').delete().eq('id', id);
        return err(credErr.message, 500);
      }

      return cors({ staff: mapStaff(newStaff) }, { status: 201 });
    }

    // All remaining routes require auth
    const ctx = await authenticate(req);

    // GET /auth/staff
    if (req.method === 'GET' && path === '/staff') {
      let query = db
        .from('staff')
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .order('name');
      if (ctx.staffRole !== 'superadmin') query = query.eq('restaurant_id', ctx.restaurantId);
      const { data, error } = await query;
      if (error) return err(error.message);
      return cors({ staff: (data ?? []).map(mapStaff) });
    }

    // GET /auth/waiters
    if (req.method === 'GET' && path === '/waiters') {
      const { data, error } = await db
        .from('staff')
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .eq('role', 'waiter')
        .eq('restaurant_id', ctx.restaurantId)
        .order('name');
      if (error) return err(error.message);
      return cors({ staff: (data ?? []).map(mapStaff) });
    }

    // GET /auth/staff/on-duty
    if (req.method === 'GET' && path === '/staff/on-duty') {
      const { data, error } = await db
        .from('staff')
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .eq('is_on_duty', true)
        .eq('restaurant_id', ctx.restaurantId)
        .order('name');
      if (error) return err(error.message);
      return cors({ staff: (data ?? []).map(mapStaff) });
    }

    // GET /auth/staff/:id
    const staffIdMatch = path.match(/^\/staff\/([^/]+)$/);
    if (req.method === 'GET' && staffIdMatch) {
      const { data, error } = await db
        .from('staff')
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .eq('id', staffIdMatch[1])
        .single();
      if (error) return err('Staff not found', 404);
      if (ctx.staffRole !== 'superadmin' && data.restaurant_id !== ctx.restaurantId) {
        return err('Unauthorized', 403);
      }
      return cors({ staff: mapStaff(data) });
    }

    // DELETE /auth/staff/:id
    if (req.method === 'DELETE' && staffIdMatch) {
      requireRole(ctx, 'manager');
      const targetId = staffIdMatch[1];
      const { data: target } = await db.from('staff').select('restaurant_id').eq('id', targetId).single();
      if (!target) return err('Staff not found', 404);
      if (target.restaurant_id !== ctx.restaurantId) return err('Unauthorized', 403);
      await db.from('staff_credentials').delete().eq('staff_id', targetId);
      await db.from('staff').delete().eq('id', targetId);
      return cors({ message: 'Staff deleted successfully' });
    }

    // PUT /auth/staff/:id/status
    const statusMatch = path.match(/^\/staff\/([^/]+)\/status$/);
    if (req.method === 'PUT' && statusMatch) {
      requireRole(ctx, 'manager', 'supervisor');
      const { isOnDuty } = await req.json();
      if (typeof isOnDuty !== 'boolean') return err('isOnDuty must be true or false', 400);
      const { data, error } = await db
        .from('staff')
        .update({ is_on_duty: isOnDuty })
        .eq('id', statusMatch[1])
        .eq('restaurant_id', ctx.restaurantId)
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .single();
      if (error) return err('Staff not found', 404);
      return cors({ staff: mapStaff(data) });
    }

    // PUT /auth/staff/:id/role
    const roleMatch = path.match(/^\/staff\/([^/]+)\/role$/);
    if (req.method === 'PUT' && roleMatch) {
      requireRole(ctx, 'manager');
      const { role } = await req.json();
      if (!['waiter', 'supervisor', 'kitchen'].includes(role)) return err('Invalid role', 400);
      const { data, error } = await db
        .from('staff')
        .update({ role })
        .eq('id', roleMatch[1])
        .eq('restaurant_id', ctx.restaurantId)
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .single();
      if (error) return err('Staff not found', 404);
      return cors({ staff: mapStaff(data) });
    }

    // PUT /auth/staff/:id/assignments
    const assignMatch = path.match(/^\/staff\/([^/]+)\/assignments$/);
    if (req.method === 'PUT' && assignMatch) {
      requireRole(ctx, 'manager');
      const { assignedTables } = await req.json();
      const tables = Array.isArray(assignedTables)
        ? assignedTables.map(Number).filter(n => !isNaN(n))
        : [];
      const { data, error } = await db
        .from('staff')
        .update({ assigned_tables: tables })
        .eq('id', assignMatch[1])
        .eq('restaurant_id', ctx.restaurantId)
        .select('id, name, role, email, phone, is_on_duty, assigned_tables, performance, hire_date, restaurant_id')
        .single();
      if (error) return err('Staff not found', 404);
      return cors({ staff: mapStaff(data) });
    }

    // PUT /auth/me/password
    if (req.method === 'PUT' && path === '/me/password') {
      const { currentPassword, newPassword } = await req.json();
      if (!currentPassword || !newPassword) return err('Both passwords required', 400);
      if (newPassword.length < 6) return err('New password must be at least 6 characters', 400);

      const { data: cred } = await db
        .from('staff_credentials')
        .select('password_hash')
        .eq('staff_id', ctx.staffId)
        .eq('restaurant_id', ctx.restaurantId)
        .single();

      if (!cred) return err('Credentials not found', 404);
      const valid = await bcrypt.compare(currentPassword, cred.password_hash);
      if (!valid) return err('Current password is incorrect', 401);

      const newHash = await bcrypt.hash(newPassword, 10);
      await db
        .from('staff_credentials')
        .update({ password_hash: newHash })
        .eq('staff_id', ctx.staffId)
        .eq('restaurant_id', ctx.restaurantId);

      return cors({ message: 'Password updated successfully' });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
