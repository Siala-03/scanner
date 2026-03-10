import type { MenuItem } from '../types';

const KEY = 'priceOverrides';

type PriceMap = Record<string, number>;

function loadPriceMap(): PriceMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PriceMap;
  } catch {
    return {};
  }
}

function savePriceMap(map: PriceMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getEffectivePrice(item: MenuItem): number {
  const map = loadPriceMap();
  const override = map[item.id];
  return typeof override === 'number' ? override : item.price;
}

export function setPriceOverride(menuItemId: string, price: number) {
  const map = loadPriceMap();
  map[menuItemId] = Math.max(0, Math.floor(price));
  savePriceMap(map);
}

