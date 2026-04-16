import type { MenuItem } from '../types';

type AnyMenuLike = Partial<MenuItem> & Record<string, unknown>;

const normalizeToken = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

export const getMenuItemCartKey = (item: AnyMenuLike): string => {
  const directId = item?.id;
  if (directId !== undefined && directId !== null && String(directId).trim()) {
    return String(directId).trim();
  }

  const legacyId = item?.menu_item_id ?? item?.menuItemId ?? item?.item_id;
  if (legacyId !== undefined && legacyId !== null && String(legacyId).trim()) {
    return String(legacyId).trim();
  }

  const category = normalizeToken(item?.category || 'uncategorized');
  const name = normalizeToken(item?.name || 'item');
  const price = Number(item?.price ?? 0);

  // Include price to avoid collisions where legacy rows omit IDs.
  return `menu-${category}-${name}-${Number.isFinite(price) ? price : 0}`;
};
