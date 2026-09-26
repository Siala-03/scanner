import { callEdgeFn } from '../lib/supabase';

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Manager saves a PIN for a staff member — stored in Supabase. */
export async function saveStaffPin(staffId: string, pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await callEdgeFn('admin-staff', {
    method: 'PATCH',
    body: { staffId, pinHash },
  });
}

/** Manager removes the PIN for a staff member. */
export async function clearStaffPinRemote(staffId: string): Promise<void> {
  await callEdgeFn('admin-staff', {
    method: 'PATCH',
    body: { staffId, pinHash: null },
  });
}

/**
 * Fetch a map of { [staffId]: pinHash } for the whole restaurant.
 * Used on the waiter selection screen so we know which staff have PINs
 * without making a separate request per waiter.
 */
export async function fetchPinHashes(): Promise<Record<string, string>> {
  try {
    const data = await callEdgeFn('admin-staff', {
      method: 'GET',
      params: { action: 'pin_hashes' },
    });
    return (data as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

/** Verify a PIN against a known hash (hash was fetched from server). */
export async function verifyPinAgainstHash(pin: string, storedHash: string): Promise<boolean> {
  const hash = await hashPin(pin);
  return hash === storedHash;
}

// ── Legacy localStorage shim (kept so StaffManagement still compiles) ────────

const STAFF_PINS_KEY = 'servv_staff_pins';

function loadPins(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STAFF_PINS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** @deprecated Check pinHashes state from fetchPinHashes() instead */
export function hasStaffPin(staffId: string): boolean {
  return !!loadPins()[staffId];
}

/** @deprecated Use clearStaffPinRemote for cross-device support */
export function clearStaffPin(staffId: string): void {
  const pins = loadPins();
  delete pins[staffId];
  try { localStorage.setItem(STAFF_PINS_KEY, JSON.stringify(pins)); } catch {}
}

/** @deprecated Used by StaffManagement only for the "PIN already set" badge */
export async function verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
  const pins = loadPins();
  const stored = pins[staffId];
  if (!stored) return false;
  const hash = await hashPin(pin);
  return hash === stored;
}
