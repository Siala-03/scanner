const KEY = 'billPresentedOrders';
const TTL = 6 * 60 * 60 * 1000; // 6 hours — auto-expire

interface Entry { ts: number }

function load(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function save(data: Record<string, Entry>) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function markBillPresented(orderId: string) {
  const data = load();
  data[orderId] = { ts: Date.now() };
  const cutoff = Date.now() - TTL;
  for (const id of Object.keys(data)) {
    if (data[id].ts < cutoff) delete data[id];
  }
  save(data);
}

export function isBillPresented(orderId: string): boolean {
  const data = load();
  const entry = data[orderId];
  if (!entry) return false;
  return Date.now() - entry.ts <= TTL;
}
