import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { compareSync, hashSync } from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function resolveSupplierFromToken(token: string, db: any) {
  const [first, second] = token.split(':');
  if (!first || !second) throw Object.assign(new Error('Invalid token'), { status: 401 });
  const { data } = await db
    .from('supplier_users')
    .select('id, supplier_id, name, email, phone')
    .eq('is_active', true)
    .or(`and(id.eq.${first},supplier_id.eq.${second}),and(id.eq.${second},supplier_id.eq.${first})`)
    .limit(1)
    .maybeSingle();
  if (!data) throw Object.assign(new Error('Invalid token'), { status: 401 });
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/supplier-auth/, '');
  const db = admin();

  try {
    // POST /supplier-auth/login
    if (req.method === 'POST' && path === '/login') {
      const { email, password } = await req.json();
      if (!email || !password) return err('Email and password required', 400);

      const { data: user } = await db
        .from('supplier_users')
        .select('id, supplier_id, password_hash, name, email, phone, is_active')
        .eq('email', email)
        .eq('is_active', true)
        .maybeSingle();

      if (!user) return err('Invalid email or password', 401);
      const valid = compareSync(password, user.password_hash);
      if (!valid) return err('Invalid email or password', 401);

      const token = `${user.id}:${user.supplier_id}`;
      return cors({ user: { id: user.id, supplierId: user.supplier_id, name: user.name, email: user.email, phone: user.phone, token } });
    }

    // POST /supplier-auth/signup
    if (req.method === 'POST' && path === '/signup') {
      const { supplierId, email, password, name, phone } = await req.json();
      if (!supplierId || !email || !password || !name) return err('All fields required', 400);

      const { data: existing } = await db
        .from('supplier_users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (existing) return err('Email already registered', 409);

      const hash = hashSync(password, 10);
      const id = `su-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { data, error } = await db
        .from('supplier_users')
        .insert({ id, supplier_id: supplierId, email, password_hash: hash, name, phone: phone ?? null, is_active: true })
        .select('id, supplier_id, name, email, phone').single();
      if (error) return err(error.message);
      const token = `${data.id}:${data.supplier_id}`;
      return cors({ user: { ...data, supplierId: data.supplier_id, token } }, { status: 201 });
    }

    // GET /supplier-auth/me
    if (req.method === 'GET' && path === '/me') {
      const authHeader = req.headers.get('authorization') ?? '';
      const token = authHeader.replace('Bearer ', '');
      if (!token) return err('Authorization required', 401);
      const user = await resolveSupplierFromToken(token, db);
      return cors({ user: { ...user, supplierId: user.supplier_id, token } });
    }

    // POST /supplier-auth/manager-access
    if (req.method === 'POST' && path === '/manager-access') {
      const ctx = await authenticate(req);
      const { supplierId, email, name, phone, password } = await req.json();
      if (!supplierId || !email || !name) return err('supplierId, email, name required', 400);

      const generatedPassword = password || Math.random().toString(36).slice(2, 14);
      const hash = hashSync(generatedPassword, 10);
      const id = `su-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const { data: existing } = await db
        .from('supplier_users')
        .select('id, supplier_id')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        const token = `${existing.id}:${existing.supplier_id}`;
        return cors({ success: true, token, temporaryPassword: generatedPassword });
      }

      await db.from('supplier_users').insert({
        id, supplier_id: supplierId, email, password_hash: hash, name, phone: phone ?? null, is_active: true
      });
      const token = `${id}:${supplierId}`;
      return cors({ success: true, token, temporaryPassword: generatedPassword }, { status: 201 });
    }

    // GET /supplier-auth/manager-access/:supplierId
    const accessMatch = path.match(/^\/manager-access\/([^/]+)$/);
    if (req.method === 'GET' && accessMatch) {
      const { data } = await db
        .from('supplier_users')
        .select('id, email, name, created_at')
        .eq('supplier_id', accessMatch[1])
        .eq('is_active', true);
      return cors({ users: data ?? [] });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
