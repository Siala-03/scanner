const IP_CACHE_KEY = 'servv_client_ip_cache';
const IP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface IpCache {
  ip: string;
  fetchedAt: number;
}

export async function getClientPublicIp(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(IP_CACHE_KEY);
    if (cached) {
      const parsed: IpCache = JSON.parse(cached);
      if (Date.now() - parsed.fetchedAt < IP_CACHE_TTL_MS) return parsed.ip;
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const ip: string | null = data?.ip ?? null;
    if (ip) {
      try {
        sessionStorage.setItem(IP_CACHE_KEY, JSON.stringify({ ip, fetchedAt: Date.now() }));
      } catch { /* ignore */ }
    }
    return ip;
  } catch {
    return null;
  }
}

export interface IpRestrictionSettings {
  enabled: boolean;
  allowedIps: string[];
}

export function parseAllowedIps(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatAllowedIps(ips: string[]): string {
  return ips.join('\n');
}

/** Module-level cache so repeated calls within the same session don't re-fetch */
const settingsCache = new Map<string, { settings: IpRestrictionSettings; fetchedAt: number }>();
const SETTINGS_TTL_MS = 5 * 60 * 1000;

export function cacheIpRestrictionSettings(restaurantId: string, settings: IpRestrictionSettings): void {
  settingsCache.set(restaurantId, { settings, fetchedAt: Date.now() });
}

export function getCachedIpRestrictionSettings(restaurantId: string): IpRestrictionSettings | null {
  const entry = settingsCache.get(restaurantId);
  if (!entry || Date.now() - entry.fetchedAt > SETTINGS_TTL_MS) return null;
  return entry.settings;
}

export function clearIpRestrictionCache(restaurantId: string): void {
  settingsCache.delete(restaurantId);
}
