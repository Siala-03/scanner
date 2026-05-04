import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signing = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signing));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${signing}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body.action;

  // ── Login ────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const { username, password, restaurantId } = body;
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'username and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let query = db
      .from('staff_credentials')
      .select('staff_id, password_hash, restaurant_id')
      .eq('username', username);

    if (restaurantId) query = query.eq('restaurant_id', restaurantId);

    const { data: credentials, error: credError } = await query;

    if (credError || !credentials || credentials.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cred =
      credentials.find((c: any) => c.restaurant_id === 'default_restaurant') ||
      credentials[0];

    if (cred.password_hash !== password) {
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: staff, error: staffError } = await db
      .from('staff')
      .select('*')
      .eq('id', cred.staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(JSON.stringify({ error: 'Staff account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET');
    if (!jwtSecret) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt({
      iss: 'supabase',
      aud: 'authenticated',
      role: 'authenticated',
      sub: staff.id,
      restaurant_id: staff.restaurant_id,
      staff_role: staff.role,
      iat: now,
      exp: now + 28800, // 8 hours
    }, jwtSecret);

    return new Response(JSON.stringify({ ...staff, token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Change password ──────────────────────────────────────────────────────
  if (action === 'change-password') {
    const { staffId, currentPassword, newPassword } = body;
    if (!staffId || !currentPassword || !newPassword) {
      return new Response(JSON.stringify({ error: 'staffId, currentPassword, and newPassword are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: creds, error: fetchErr } = await db
      .from('staff_credentials')
      .select('password_hash')
      .eq('staff_id', staffId)
      .single();

    if (fetchErr || !creds) {
      return new Response(JSON.stringify({ error: 'Credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (creds.password_hash !== currentPassword) {
      return new Response(JSON.stringify({ error: 'Current password is incorrect' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateErr } = await db
      .from('staff_credentials')
      .update({ password_hash: newPassword })
      .eq('staff_id', staffId);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
