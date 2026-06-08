/**
 * Offline authentication using the staff member's existing password.
 *
 * Flow:
 *   Online login → saveOfflineProfile() + savePasswordHash() + saveUsername() (automatic)
 *   Offline open  → getProfileByUsername() → verifyPassword() → restoreSession()
 *
 * Passwords are hashed with SHA-256 + staffId salt via Web Crypto (runs offline).
 * The raw password is never written to storage.
 */

import type { Staff } from '../types';

const PROFILES_KEY = 'servv_offline_profiles';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface OfflineProfile {
  staffId: string;
  staffName: string;
  staffRole: string;
  username?: string;             // login username for multi-user offline lookup
  restaurantId: string;
  restaurantName: string;
  passwordHash: string | null;  // SHA-256(password + ':' + staffId)
  failedAttempts: number;
  lockedUntil: number | null;
  lastLoginAt: number;
  authUserSnapshot: string;     // JSON of Staff — restored on offline login
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function loadProfiles(): Record<string, OfflineProfile> {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles: Record<string, OfflineProfile>): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch { /* quota exceeded — non-fatal */ }
}

// ─── SHA-256 via Web Crypto (available offline, no library needed) ────────────

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called after every successful online login.
 * Preserves the existing password hash — only refreshes identity + snapshot.
 */
export function saveOfflineProfile(staff: Staff, restaurantName: string): void {
  const profiles = loadProfiles();
  const existing = profiles[staff.id];
  profiles[staff.id] = {
    staffId: staff.id,
    staffName: staff.name,
    staffRole: staff.role,
    restaurantId: staff.restaurantId ?? '',
    restaurantName,
    passwordHash: existing?.passwordHash ?? null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: Date.now(),
    authUserSnapshot: JSON.stringify(staff),
  };
  saveProfiles(profiles);
  localStorage.setItem('servv_last_staff_id', staff.id);
}

/**
 * Hash and store the password immediately after a successful online login.
 * Called automatically — no extra step for the user.
 * Re-hashing on each login means password changes are picked up immediately.
 */
export async function savePasswordHash(staffId: string, password: string): Promise<void> {
  if (!loadProfiles()[staffId]) return;
  // Hash first (async), then reload profiles so we merge into the current state.
  // If we captured the snapshot before awaiting, saveUsername's synchronous write
  // (which runs between the snapshot and this resume) would be silently overwritten.
  const passwordHash = await sha256(password + ':' + staffId);
  const profiles = loadProfiles();
  if (!profiles[staffId]) return;
  profiles[staffId] = { ...profiles[staffId], passwordHash, failedAttempts: 0, lockedUntil: null };
  saveProfiles(profiles);
}

/** True if a password hash has been stored for this staff member. */
export function hasPasswordHash(staffId: string): boolean {
  return !!loadProfiles()[staffId]?.passwordHash;
}

/** Returns the most recently logged-in profile, or null if none. */
export function getLastProfile(): OfflineProfile | null {
  const lastId = localStorage.getItem('servv_last_staff_id');
  if (!lastId) return null;
  return loadProfiles()[lastId] ?? null;
}

/** Returns a profile by staffId. */
export function getProfile(staffId: string): OfflineProfile | null {
  return loadProfiles()[staffId] ?? null;
}

/** True if the account is currently locked. */
export function isLockedOut(staffId: string): boolean {
  const p = loadProfiles()[staffId];
  if (!p?.lockedUntil) return false;
  if (Date.now() >= p.lockedUntil) {
    const profiles = loadProfiles();
    profiles[staffId] = { ...profiles[staffId], lockedUntil: null, failedAttempts: 0 };
    saveProfiles(profiles);
    return false;
  }
  return true;
}

/** Seconds remaining in the lockout, or 0 if not locked. */
export function lockoutRemainingSeconds(staffId: string): number {
  const p = loadProfiles()[staffId];
  if (!p?.lockedUntil) return 0;
  return Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000));
}

/** Remaining password attempts before lockout. */
export function remainingAttempts(staffId: string): number {
  const p = loadProfiles()[staffId];
  if (!p) return MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - p.failedAttempts);
}

/**
 * Verify a password against the stored hash.
 * Tracks failed attempts and applies a 5-minute lockout after 5 failures.
 */
export async function verifyPassword(staffId: string, password: string): Promise<boolean> {
  if (!loadProfiles()[staffId]?.passwordHash) return false;
  if (isLockedOut(staffId)) return false;

  // Reload after isLockedOut — it may have cleared an expired lock and reset failedAttempts.
  // Using the pre-call snapshot would carry the stale failedAttempts (e.g. 5) and cause an
  // immediate re-lockout on the very first wrong attempt after the lock expires.
  const profiles = loadProfiles();
  const profile = profiles[staffId];
  if (!profile?.passwordHash) return false;

  const hash = await sha256(password + ':' + staffId);
  const correct = hash === profile.passwordHash;

  if (correct) {
    profiles[staffId] = { ...profile, failedAttempts: 0, lockedUntil: null };
    saveProfiles(profiles);
    return true;
  }

  const attempts = profile.failedAttempts + 1;
  profiles[staffId] = {
    ...profile,
    failedAttempts: attempts,
    lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null,
  };
  saveProfiles(profiles);
  return false;
}

/**
 * Restore the Staff object from the cached snapshot.
 * Re-writes localStorage so the rest of the app works normally offline.
 */
export function restoreSession(staffId: string): Staff | null {
  const profile = loadProfiles()[staffId];
  if (!profile?.authUserSnapshot) return null;
  try {
    const staff: Staff = JSON.parse(profile.authUserSnapshot);
    localStorage.setItem('authUser', profile.authUserSnapshot);
    localStorage.setItem('staffId', staffId);
    localStorage.setItem('staffRole', staff.role);
    localStorage.setItem('restaurantId', profile.restaurantId);
    return staff;
  } catch {
    return null;
  }
}

/** Save the login username on the profile so it can be looked up offline. */
export function saveUsername(staffId: string, username: string): void {
  const profiles = loadProfiles();
  if (!profiles[staffId]) return;
  profiles[staffId] = { ...profiles[staffId], username };
  saveProfiles(profiles);
}

/** Find a profile by login username (case-insensitive). */
export function getProfileByUsername(username: string): OfflineProfile | null {
  const lower = username.trim().toLowerCase();
  return (
    Object.values(loadProfiles()).find(
      (p) => p.username?.trim().toLowerCase() === lower
    ) ?? null
  );
}

/** True if at least one profile with a usable password hash is cached. */
export function hasAnyCachedProfile(): boolean {
  return Object.values(loadProfiles()).some((p) => !!p.passwordHash);
}
