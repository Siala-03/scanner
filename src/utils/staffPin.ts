const STAFF_PINS_KEY = 'servv_staff_pins';

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function loadPins(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STAFF_PINS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePins(pins: Record<string, string>): void {
  try {
    localStorage.setItem(STAFF_PINS_KEY, JSON.stringify(pins));
  } catch {}
}

export async function saveStaffPin(staffId: string, pin: string): Promise<void> {
  const hash = await hashPin(pin);
  const pins = loadPins();
  pins[staffId] = hash;
  savePins(pins);
}

export async function verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
  const pins = loadPins();
  const stored = pins[staffId];
  if (!stored) return false;
  const hash = await hashPin(pin);
  return hash === stored;
}

export function hasStaffPin(staffId: string): boolean {
  return !!loadPins()[staffId];
}

export function clearStaffPin(staffId: string): void {
  const pins = loadPins();
  delete pins[staffId];
  savePins(pins);
}
