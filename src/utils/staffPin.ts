/**
 * Staff PIN storage — PINs are stored as SHA-256 hashes inside the
 * restaurant's `settings.staff_pins` JSONB column so they work across
 * all devices without any schema migration or edge-function deployment.
 */
import { supabase } from '../lib/supabase';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getRestaurantId(): string | null {
  if (typeof window === 'undefined') return null;
  const direct = localStorage.getItem('restaurantId');
  if (direct?.trim()) return direct;
  try {
    const raw = localStorage.getItem('authUser');
    if (raw) {
      const u = JSON.parse(raw);
      return u?.restaurantId || u?.restaurant_id || null;
    }
  } catch {}
  return null;
}

async function loadPinMap(): Promise<Record<string, string>> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return {};
  const { data } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .single();
  return (data?.settings as any)?.staff_pins ?? {};
}

async function savePinMap(map: Record<string, string>): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return;

  // Read-merge-write to avoid clobbering other settings keys
  const { data } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .single();

  const existing = (data?.settings as Record<string, unknown>) ?? {};
  await supabase
    .from('restaurants')
    .update({ settings: { ...existing, staff_pins: map } })
    .eq('id', restaurantId);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Manager saves a 4-digit PIN for a staff member. */
export async function saveStaffPin(staffId: string, pin: string): Promise<void> {
  const hash = await hashPin(pin);
  const map = await loadPinMap();
  map[staffId] = hash;
  await savePinMap(map);
}

/** Manager removes a PIN. */
export async function clearStaffPinRemote(staffId: string): Promise<void> {
  const map = await loadPinMap();
  delete map[staffId];
  await savePinMap(map);
}

/**
 * Returns { staffId: sha256Hash } for every staff member with a PIN.
 * Used by the waiter selection screen on mount.
 */
export async function fetchPinHashes(): Promise<Record<string, string>> {
  try {
    return await loadPinMap();
  } catch {
    return {};
  }
}

/** Verify a PIN against a known hash (hash was already fetched from server). */
export async function verifyPinAgainstHash(pin: string, storedHash: string): Promise<boolean> {
  const hash = await hashPin(pin);
  return hash === storedHash;
}

// ── Legacy shims (keep StaffManagement compiling without changes) ─────────────

export function hasStaffPin(_staffId: string): boolean { return false; }
export function clearStaffPin(_staffId: string): void {}
export async function verifyStaffPin(_staffId: string, _pin: string): Promise<boolean> { return false; }
