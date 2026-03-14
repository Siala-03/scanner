import type { MenuItem, MenuCategory } from '../types';
import { menuItems as defaultMenuItems } from '../data/menuData';
import { fetchMenu, uploadMenu, clearMenu } from '../api/menu';

// Menu storage key (for offline fallback)
const MENU_STORAGE_KEY = 'custom_menu_items';

/**
 * Get all menu items (from backend, or local fallback)
 */
export async function getAllMenuItems(): Promise<MenuItem[]> {
  try {
    const backendMenu = await fetchMenu();
    if (backendMenu.length > 0) {
      // Cache locally for offline
      localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(backendMenu));
      return backendMenu;
    }
  } catch (err) {
    console.warn('Backend menu unavailable, using local');
  }
  
  // Fallback to local storage or default
  const stored = localStorage.getItem(MENU_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return defaultMenuItems;
    }
  }
  return defaultMenuItems;
}

/**
 * Save custom menu to localStorage (for offline)
 */
export function saveCustomMenu(items: MenuItem[]): void {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(items));
}

/**
 * Reset to default menu (clear local and backend)
 */
export async function resetToDefaultMenu(): Promise<void> {
  localStorage.removeItem(MENU_STORAGE_KEY);
  try {
    await clearMenu();
  } catch (err) {
    console.warn('Failed to clear backend menu');
  }
}

/**
 * Export menu to JSON file
 */
export function exportMenuToJson(items: MenuItem[]): void {
  const dataStr = JSON.stringify(items, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `menu-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export menu to CSV file
 */
export function exportMenuToCsv(items: MenuItem[]): void {
  const headers = ['id', 'name', 'description', 'price', 'category', 'emoji', 'prepTime', 'isAvailable', 'isPopular'];
  const rows = items.map(item => [
    item.id,
    `"${item.name.replace(/"/g, '""')}"`,
    `"${item.description.replace(/"/g, '""')}"`,
    item.price.toString(),
    item.category,
    item.emoji,
    item.prepTime.toString(),
    item.isAvailable.toString(),
    item.isPopular.toString()
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `menu-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import menu from JSON file and save to backend
 */
export async function importMenuFromJson(file: File): Promise<MenuItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!Array.isArray(data)) {
          reject(new Error('Invalid menu format: expected array'));
          return;
        }
        // Validate and normalize items
        const items: MenuItem[] = data.map((item: Partial<MenuItem>, index: number) => ({
          id: item.id || `item-${Date.now()}-${index}`,
          name: item.name || 'Unnamed Item',
          description: item.description || '',
          price: typeof item.price === 'number' ? item.price : 0,
          category: item.category || 'lunch',
          emoji: item.emoji || '🍽️',
          prepTime: typeof item.prepTime === 'number' ? item.prepTime : 15,
          isAvailable: item.isAvailable !== false,
          isPopular: item.isPopular || false
        }));
        
        // Save to local storage first (offline backup)
        saveCustomMenu(items);
        
        // Try to save to backend
        try {
          await uploadMenu(items);
        } catch (err) {
          console.warn('Failed to upload to backend, saved locally only');
        }
        
        resolve(items);
      } catch (err) {
        reject(new Error('Failed to parse menu file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Check if custom menu is in use
 */
export function hasCustomMenu(): boolean {
  return localStorage.getItem(MENU_STORAGE_KEY) !== null;
}

/**
 * Sync menu with backend (try to upload local changes)
 */
export async function syncMenuToBackend(): Promise<boolean> {
  const stored = localStorage.getItem(MENU_STORAGE_KEY);
  if (!stored) return false;
  
  try {
    const items = JSON.parse(stored);
    await uploadMenu(items);
    return true;
  } catch (err) {
    console.warn('Failed to sync menu to backend');
    return false;
  }
}
