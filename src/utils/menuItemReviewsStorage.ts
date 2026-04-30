const KEY = 'menuItemReviews';

// Stores { [menuItemId]: orderId } so we know which items this device reviewed
function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function hasReviewedMenuItem(menuItemId: string): boolean {
  return !!load()[menuItemId];
}

export function markMenuItemReviewed(menuItemId: string, orderId: string): void {
  try {
    const data = load();
    data[menuItemId] = orderId;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
