import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

// Staff/manager passwords were historically stored in plain text by
// staff-login, admin-staff and restaurants (the older `auth` function already
// used bcrypt). New and changed passwords are always bcrypt-hashed; a legacy
// plain-text value still verifies once and should then be upgraded in place.

const BCRYPT_COST = 10;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

// Compare without short-circuiting on the first differing character.
function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * `needsUpgrade` is true when the stored value was legacy plain text and the
 * password matched — the caller should replace it with `hashPassword(password)`.
 */
export function verifyPassword(
  password: string,
  stored: string | null | undefined,
): { valid: boolean; needsUpgrade: boolean } {
  if (!stored) return { valid: false, needsUpgrade: false };
  if (isBcryptHash(stored)) {
    return { valid: bcrypt.compareSync(password, stored), needsUpgrade: false };
  }
  const valid = constantTimeEqual(password, stored);
  return { valid, needsUpgrade: valid };
}
