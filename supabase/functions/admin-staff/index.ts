import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const AUTHORIZED_ROLES = ['superadmin', 'manager', 'supervisor'];

async function verifyStaff(staffId: string | null) {
  if (!staffId) return null;
  const { data } = await db
    .from('staff')
    .select('id, role, restaurant_id')
    .eq('id', staffId)
    .single();
  if (!data || !AUTHORIZED_ROLES.includes(data.role)) return null;
  return data as { id: string; role: string; restaurant_id: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const caller = await verifyStaff(req.headers.get('x-staff-id'));
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Create staff ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body: any;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { name, email, phone, role, username, password, restaurantId } = body;

    if (role === 'superadmin' && caller.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Only superadmin can create superadmin accounts' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Non-superadmin may only create staff for their own restaurant
    const targetRestaurantId =
      caller.role === 'superadmin' ? (restaurantId || caller.restaurant_id) : caller.restaurant_id;

    const staffId = `staff-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const { data: raw, error: staffError } = await db
      .from('staff')
      .insert({
        id: staffId,
        name,
        email,
        phone,
        role,
        is_on_duty: true,
        assigned_tables: [],
        performance: {},
        hire_date: new Date().toISOString(),
        restaurant_id: targetRestaurantId ?? null,
      })
      .select()
      .single();

    if (staffError) {
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: credError } = await db
      .from('staff_credentials')
      .insert({
        staff_id: staffId,
        username,
        password_hash: password,
        restaurant_id: targetRestaurantId ?? null,
      });

    if (credError) {
      await db.from('staff').delete().eq('id', staffId);
      return new Response(JSON.stringify({
        error: credError.message.includes('duplicate') ? 'Username already taken' : credError.message,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(raw), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Fetch staff credentials (username only) ──────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const targetStaffId = url.searchParams.get('staff_id');

    if (!targetStaffId) {
      return new Response(JSON.stringify({ error: 'staff_id query param is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (caller.role !== 'superadmin') {
      const { data: target } = await db
        .from('staff')
        .select('restaurant_id')
        .eq('id', targetStaffId)
        .single();

      if (!target || target.restaurant_id !== caller.restaurant_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: creds, error: fetchErr } = await db
      .from('staff_credentials')
      .select('username')
      .eq('staff_id', targetStaffId)
      .single();

    if (fetchErr || !creds) {
      return new Response(JSON.stringify({ error: 'Credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ username: creds.username }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Update staff credentials ─────────────────────────────────────────────
  if (req.method === 'PATCH') {
    let body: any;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { staffId: targetStaffId, username, password } = body;

    if (!targetStaffId) {
      return new Response(JSON.stringify({ error: 'staffId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Non-superadmin may only update staff in their own restaurant
    if (caller.role !== 'superadmin') {
      const { data: target } = await db
        .from('staff')
        .select('restaurant_id')
        .eq('id', targetStaffId)
        .single();

      if (!target || target.restaurant_id !== caller.restaurant_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const updates: Record<string, string> = {};
    if (username) updates.username = username;
    if (password) updates.password_hash = password;

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: 'Nothing to update' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await db
      .from('staff_credentials')
      .update(updates)
      .eq('staff_id', targetStaffId);

    if (updateError) {
      return new Response(JSON.stringify({
        error: updateError.message.includes('duplicate') ? 'Username already taken' : updateError.message,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Delete staff ─────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const targetStaffId = url.searchParams.get('staff_id');

    if (!targetStaffId) {
      return new Response(JSON.stringify({ error: 'staff_id query param is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Non-superadmin may only delete staff in their own restaurant
    if (caller.role !== 'superadmin') {
      const { data: target } = await db
        .from('staff')
        .select('restaurant_id')
        .eq('id', targetStaffId)
        .single();

      if (!target || target.restaurant_id !== caller.restaurant_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    await db.from('staff_credentials').delete().eq('staff_id', targetStaffId);
    const { error } = await db.from('staff').delete().eq('id', targetStaffId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
