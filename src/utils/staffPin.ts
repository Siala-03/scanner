/**
 * Staff PINs for the shared waiter terminal.
 *
 * PINs live server-side in the `staff_pins` table and are only reachable via
 * the `staff-pin` Edge Function: the browser learns *which* staff have a PIN
 * and whether an entered PIN is right — never the hashes. (They used to sit in
 * the public restaurants.settings column as unsalted SHA-256.)
 *
 * Offline fallback: the last known PIN list, and a salted hash of each PIN
 * that was verified online on this device, are cached locally so the terminal
 * keeps working — and keeps asking for PINs — during an internet outage.
 */
import { callEdgeFn } from '../lib/supabase';

const STATUS_CACHE_KEY = 'staffPinStatus';
const VERIFIED_CACHE_KEY = 'staffPinVerified';
const DEVICE_SALT_KEY = 'staffPinDeviceSalt';
const OFFLINE_ITERATIONS = 100_000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** A network failure (as opposed to the server answering with an error). */
function isOffline(e: unknown): boolean {
  return (typeof navigator !== 'undefined' && !navigator.onLine) || e instanceof TypeError;
}

function deviceSalt(): Uint8Array<ArrayBuffer> {
  let salt = readJson<number[] | null>(DEVICE_SALT_KEY, null);
  if (!salt) {
    salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    writeJson(DEVICE_SALT_KEY, salt);
  }
  return new Uint8Array(salt);
}

async function offlineHash(staffId: string, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${staffId}:${pin}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: deviceSalt(), iterations: OFFLINE_ITERATIONS },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function staffPinCall(body: Record<string, unknown>): Promise<any> {
  return callEdgeFn('staff-pin', { method: 'POST', body });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** { staffId: true } for every staff member who has a PIN (cached for offline use). */
export async function fetchPinStatus(): Promise<Record<string, boolean>> {
  try {
    const { pins } = await staffPinCall({ action: 'status' });
    writeJson(STATUS_CACHE_KEY, pins ?? {});
    return pins ?? {};
  } catch {
    return readJson<Record<string, boolean>>(STATUS_CACHE_KEY, {});
  }
}

export type PinCheck = { valid: boolean; lockedSeconds?: number; offline?: boolean };

/** Check a waiter's PIN with the server, falling back to this device's cache when offline. */
export async function verifyStaffPin(staffId: string, pin: string): Promise<PinCheck> {
  try {
    const result: PinCheck = await staffPinCall({ action: 'verify', staffId, pin });
    if (result.valid) {
      const cache = readJson<Record<string, string>>(VERIFIED_CACHE_KEY, {});
      cache[staffId] = await offlineHash(staffId, pin);
      writeJson(VERIFIED_CACHE_KEY, cache);
    }
    return result;
  } catch (e) {
    if (!isOffline(e)) throw e;
    const cached = readJson<Record<string, string>>(VERIFIED_CACHE_KEY, {})[staffId];
    return { valid: !!cached && cached === (await offlineHash(staffId, pin)), offline: true };
  }
}

/** Manager sets (or replaces) a 4-digit PIN for a staff member. */
export async function saveStaffPin(staffId: string, pin: string): Promise<void> {
  await staffPinCall({ action: 'set', staffId, pin });
  const cache = readJson<Record<string, string>>(VERIFIED_CACHE_KEY, {});
  delete cache[staffId];
  writeJson(VERIFIED_CACHE_KEY, cache);
}

/** Manager removes a PIN. */
export async function clearStaffPinRemote(staffId: string): Promise<void> {
  await staffPinCall({ action: 'clear', staffId });
  const cache = readJson<Record<string, string>>(VERIFIED_CACHE_KEY, {});
  delete cache[staffId];
  writeJson(VERIFIED_CACHE_KEY, cache);
}
