import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, err, optionsResponse } from '../_shared/cors.ts';
import { authenticate, requireRole } from '../_shared/auth.ts';

// Shared-terminal PINs. Hashes never leave the server: the browser asks
// "which staff have a PIN" and "is this PIN right", nothing more.
//
// POST { action: 'status' }                 → { pins: { [staffId]: true } }
// POST { action: 'verify', staffId, pin }   → { valid: boolean, lockedSeconds?: number }
// POST { action: 'set',    staffId, pin }   → { success: true }   (manager/supervisor)
// POST { action: 'clear',  staffId }        → { success: true }   (manager/supervisor)

const db = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();
const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toB64(bits);
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${await pbkdf2(pin, salt, PBKDF2_ITERATIONS)}`;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns whether the PIN matches, and whether the stored hash is a legacy one to upgrade. */
async function checkPin(pin: string, stored: string): Promise<{ valid: boolean; legacy: boolean }> {
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, hash] = stored.split('$');
    return { valid: (await pbkdf2(pin, fromB64(salt), Number(iter))) === hash, legacy: false };
  }
  if (stored.startsWith('sha256$')) {
    return { valid: (await sha256Hex(pin)) === stored.slice(7), legacy: true };
  }
  return { valid: false, legacy: false };
}

/** The target staff member must belong to the caller's restaurant. */
async function sameRestaurant(client: ReturnType<typeof db>, staffId: string, restaurantId: string): Promise<boolean> {
  const { data } = await client.from('staff').select('restaurant_id').eq('id', staffId).maybeSingle();
  return !!data && String(data.restaurant_id) === String(restaurantId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return err('Method not allowed', 405);

  try {
    const ctx = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const client = db();
    const restaurantId = String(ctx.restaurantId);

    if (body.action === 'status') {
      const { data, error } = await client.from('staff_pins').select('staff_id').eq('restaurant_id', restaurantId);
      if (error) return err(error.message);
      return cors({ pins: Object.fromEntries((data ?? []).map((r: any) => [r.staff_id, true])) });
    }

    const staffId = String(body.staffId ?? '');
    if (!staffId) return err('staffId is required', 400);
    if (!(await sameRestaurant(client, staffId, restaurantId))) return err('Staff member not found', 404);

    if (body.action === 'verify') {
      const pin = String(body.pin ?? '');
      const { data: row } = await client.from('staff_pins').select('*').eq('staff_id', staffId).maybeSingle();
      if (!row) return cors({ valid: false });

      const lockedMs = row.locked_until ? new Date(row.locked_until).getTime() - Date.now() : 0;
      if (lockedMs > 0) return cors({ valid: false, lockedSeconds: Math.ceil(lockedMs / 1000) });

      const { valid, legacy } = await checkPin(pin, row.pin_hash);
      if (valid) {
        await client.from('staff_pins').update({
          failed_attempts: 0,
          locked_until: null,
          ...(legacy ? { pin_hash: await hashPin(pin), updated_at: new Date().toISOString() } : {}),
        }).eq('staff_id', staffId);
        return cors({ valid: true });
      }

      // Wrong PIN: count it, and lock briefly after too many tries (4 digits = 10k guesses).
      const attempts = (row.failed_attempts ?? 0) + 1;
      const lock = attempts >= MAX_ATTEMPTS;
      await client.from('staff_pins').update({
        failed_attempts: lock ? 0 : attempts,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      }).eq('staff_id', staffId);
      return cors({ valid: false, ...(lock ? { lockedSeconds: LOCK_MINUTES * 60 } : {}) });
    }

    requireRole(ctx, 'manager', 'supervisor', 'superadmin');

    if (body.action === 'set') {
      const pin = String(body.pin ?? '');
      if (!/^\d{4}$/.test(pin)) return err('PIN must be exactly 4 digits', 400);
      const { error } = await client.from('staff_pins').upsert({
        staff_id: staffId,
        restaurant_id: restaurantId,
        pin_hash: await hashPin(pin),
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      });
      if (error) return err(error.message);
      return cors({ success: true });
    }

    if (body.action === 'clear') {
      const { error } = await client.from('staff_pins').delete().eq('staff_id', staffId);
      if (error) return err(error.message);
      return cors({ success: true });
    }

    return err('Unknown action', 400);
  } catch (e: any) {
    return err(e?.message || 'Internal error', e?.status || 500);
  }
});
