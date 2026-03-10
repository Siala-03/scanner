import type { InventoryRecord, MenuItem } from '../types';
import { menuItems as fallbackMenuItems } from '../data/menuData';

const KEY = 'inventoryRecords';

type InventoryMap = Record<string, InventoryRecord>;

function defaultThreshold(item: MenuItem): number {
  if (item.category === 'beers' || item.category === 'soft-drinks') return 6;
  if (item.category === 'wine' || item.category === 'alcoholic-drinks') return 3;
  return 4;
}

function defaultStock(item: MenuItem): number {
  if (item.category === 'beers' || item.category === 'soft-drinks') return 34;
  if (item.category === 'wine' || item.category === 'alcoholic-drinks') return 18;
  return 20;
}

export function loadInventoryMap(): InventoryMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as InventoryMap;
  } catch {
    return {};
  }
}

export function saveInventoryMap(map: InventoryMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function ensureInventoryInitialized(menuItems: MenuItem[] = fallbackMenuItems) {
  const map = loadInventoryMap();
  let changed = false;
  for (const item of menuItems) {
    if (!map[item.id]) {
      map[item.id] = {
        menuItemId: item.id,
        stock: defaultStock(item),
        lowStockThreshold: defaultThreshold(item),
        updatedAt: new Date().toISOString()
      };
      changed = true;
    }
  }
  if (changed) saveInventoryMap(map);
}

export function getStock(menuItemId: string): InventoryRecord | null {
  const map = loadInventoryMap();
  return map[menuItemId] ?? null;
}

export function setStock(menuItemId: string, stock: number) {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  map[menuItemId] = {
    menuItemId,
    stock: Math.max(0, Math.floor(stock)),
    lowStockThreshold: existing?.lowStockThreshold ?? 3,
    updatedAt: new Date().toISOString()
  };
  saveInventoryMap(map);
}

export function setLowStockThreshold(menuItemId: string, threshold: number) {
  const map = loadInventoryMap();
  const existing = map[menuItemId];
  map[menuItemId] = {
    menuItemId,
    stock: existing?.stock ?? 0,
    lowStockThreshold: Math.max(0, Math.floor(threshold)),
    updatedAt: new Date().toISOString()
  };
  saveInventoryMap(map);
}

export function decrementInventoryForOrder(items: { menuItemId: string; quantity: number }[]) {
  const map = loadInventoryMap();
  const now = new Date().toISOString();
  for (const it of items) {
    const existing = map[it.menuItemId] ?? {
      menuItemId: it.menuItemId,
      stock: 0,
      lowStockThreshold: 3,
      updatedAt: now
    };
    map[it.menuItemId] = {
      ...existing,
      stock: Math.max(0, (existing.stock ?? 0) - it.quantity),
      updatedAt: now
    };
  }
  saveInventoryMap(map);
}

export function listLowStock(menuItems: MenuItem[] = fallbackMenuItems) {
  ensureInventoryInitialized(menuItems);
  const map = loadInventoryMap();
  return menuItems
    .map((mi) => {
      const rec = map[mi.id]!;
      return { item: mi, stock: rec.stock, lowStockThreshold: rec.lowStockThreshold };
    })
    .filter((x) => x.stock <= x.lowStockThreshold)
    .sort((a, b) => a.stock - b.stock);
}

