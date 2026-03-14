import type { MenuItem, MenuCategory } from '../types';
import { menuItems as defaultMenuItems } from '../data/menuData';
import { fetchMenu, uploadMenu, clearMenu } from '../api/menu';

// Import xlsx for Excel support
import * as XLSX from 'xlsx';

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
 * Parse CSV content to menu items
 */
function parseCsvContent(content: string): Partial<MenuItem>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const items: Partial<MenuItem>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const item: Partial<MenuItem> = {};
    headers.forEach((header, index) => {
      const value = values[index] || '';
      switch (header) {
        case 'id':
          item.id = value;
          break;
        case 'name':
          item.name = value;
          break;
        case 'description':
          item.description = value.replace(/^"|"$/g, '');
          break;
        case 'price':
          item.price = parseFloat(value) || 0;
          break;
        case 'category':
          item.category = value;
          break;
        case 'emoji':
          item.emoji = value;
          break;
        case 'preptime':
          item.prepTime = parseInt(value, 10) || 15;
          break;
        case 'isavailable':
          item.isAvailable = value.toLowerCase() === 'true';
          break;
        case 'ispopular':
          item.isPopular = value.toLowerCase() === 'true';
          break;
      }
    });
    
    if (item.name) {
      items.push(item);
    }
  }
  
  return items;
}

/**
 * Parse Excel (.xlsx) content to menu items
 */
function parseExcelContent(arrayBuffer: ArrayBuffer): Partial<MenuItem>[] {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
    
    return jsonData.map((row: Record<string, any>) => ({
      id: row.id || row.ID || row.Id,
      name: row.name || row.Name || row.ITEM || row.Item,
      description: row.description || row.Description || row.desc || row.Desc || '',
      price: parseFloat(row.price || row.Price || row.PRICE || row.amount || 0) || 0,
      category: row.category || row.Category || row.type || row.Type || 'lunch',
      emoji: row.emoji || row.Emoji || '🍽️',
      prepTime: parseInt(row.prepTime || row.prep_time || row.prep || row.PrepTime || 15, 10) || 15,
      isAvailable: row.isAvailable !== false && row.is_available !== false && row.Available !== false,
      isPopular: row.isPopular === true || row.is_popular === true || row.Popular === true
    }));
  } catch (err) {
    console.error('Error parsing Excel:', err);
    return [];
  }
}

/**
 * Import menu from file (JSON, CSV, or Excel)
 */
export async function importMenuFromFile(file: File): Promise<MenuItem[]> {
  const fileName = file.name.toLowerCase();
  let items: Partial<MenuItem>[];
  
  if (fileName.endsWith('.json')) {
    // Parse JSON
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('Invalid menu format: expected array');
    }
    items = data;
  } else if (fileName.endsWith('.csv')) {
    // Parse CSV
    const text = await file.text();
    items = parseCsvContent(text);
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    // Try to parse Excel
    const arrayBuffer = await file.arrayBuffer();
    items = parseExcelContent(arrayBuffer);
    if (items.length === 0) {
      throw new Error('Excel parsing requires xlsx library. Please convert to CSV or JSON.');
    }
  } else {
    throw new Error('Unsupported file format. Please use JSON, CSV, or Excel (.xlsx)');
  }
  
  // Normalize items
  const normalizedItems: MenuItem[] = items.map((item, index) => ({
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
  saveCustomMenu(normalizedItems);
  
  // Try to save to backend
  try {
    await uploadMenu(normalizedItems);
  } catch (err) {
    console.warn('Failed to upload to backend, saved locally only');
  }
  
  return normalizedItems;
}

/**
 * @deprecated Use importMenuFromFile instead
 */
export async function importMenuFromJson(file: File): Promise<MenuItem[]> {
  return importMenuFromFile(file);
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
