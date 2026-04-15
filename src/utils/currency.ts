export type CurrencyCode = 'RWF' | 'KShs' | 'UGX';

const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string }> = {
  RWF:  { symbol: 'RWF',  label: 'RWF – Rwandan Franc' },
  KShs: { symbol: 'KShs', label: 'KShs – Kenyan Shilling' },
  UGX:  { symbol: 'UGX',  label: 'UGX – Ugandan Shilling' },
};

export const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(([code, meta]) => ({
  code: code as CurrencyCode,
  label: meta.label,
  symbol: meta.symbol,
}));

const STORAGE_KEY = 'currency';
const DEFAULT: CurrencyCode = 'RWF';

export function getCurrency(): CurrencyCode {
  const stored = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
  return stored && stored in CURRENCIES ? stored : DEFAULT;
}

export function setCurrency(code: CurrencyCode): void {
  localStorage.setItem(STORAGE_KEY, code);
}

export function formatPrice(amount: number): string {
  const code = getCurrency();
  return `${CURRENCIES[code].symbol} ${Math.round(amount).toLocaleString()}`;
}
