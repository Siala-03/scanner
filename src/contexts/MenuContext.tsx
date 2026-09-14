import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuItem } from '../types';
import { fetchMenu, uploadMenu } from '../api/menu';
import { supabase } from '../lib/supabase';
import { getMenuItemCartKey } from '../utils/menuKeys';

function getRestaurantIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const restaurantTableMatch = path.match(/^\/r\/([^/]+)\/t\/(\d+)/);
  if (restaurantTableMatch) {
    return decodeURIComponent(restaurantTableMatch[1]);
  }
  const query = new URLSearchParams(window.location.search);
  return query.get('restaurantId');
}

function getRestaurantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('restaurantId') || getRestaurantIdFromUrl() || null;
}

const MENU_CACHE_PREFIX = 'servv_menu_cache';

function getMenuCacheKey(): string {
  const rid = getRestaurantId();
  return rid ? `${MENU_CACHE_PREFIX}_${rid}` : MENU_CACHE_PREFIX;
}

function saveMenuCache(items: MenuItem[]): void {
  try {
    localStorage.setItem(getMenuCacheKey(), JSON.stringify(items));
  } catch {}
}

function loadMenuCache(): MenuItem[] | null {
  try {
    const raw = localStorage.getItem(getMenuCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function isMinimartRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.toLowerCase().includes('minimart');
}

interface MenuContextValue {
  menuItems: MenuItem[];
  categories: string[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveMenu: (items: MenuItem[]) => Promise<void>;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenuContext() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error('useMenuContext must be used inside <MenuProvider>');
  return ctx;
}

// Normalize raw Supabase snake_case rows to the camelCase MenuItem shape used by the app
const normalizeMenuItem = (item: any): MenuItem => ({
  id: getMenuItemCartKey(item),
  name: item.name || '',
  description: item.description || '',
  price: item.price || 0,
  category: item.category || 'lunch',
  emoji: item.emoji || '🍽️',
  prepTime: item.prep_time ?? item.prepTime ?? 15,
  isAvailable: item.is_available ?? item.isAvailable ?? true,
  isPopular: item.is_popular ?? item.isPopular ?? false,
  requiresKitchen: item.requires_kitchen ?? item.requiresKitchen,
});

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const menu = await fetchMenu();
      if (menu.length > 0) {
        const normalized = menu.map(normalizeMenuItem);
        setMenuItems(normalized);
        saveMenuCache(normalized);
      } else {
        setMenuItems([]);
      }
      setError(null);
    } catch (err) {
      const cached = loadMenuCache();
      if (cached) {
        setMenuItems(cached);
        setError(null);
      } else {
        setMenuItems([]);
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveMenu = useCallback(async (items: MenuItem[]) => {
    setIsLoading(true);
    try {
      await uploadMenu(items as any);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const categories = useMemo(
    () => Array.from(new Set(menuItems.map((item) => item.category))),
    [menuItems]
  );

  useEffect(() => {
    let isMounted = true;

    // Initial load — use cached menu immediately so the UI is never blank offline
    const load = async () => {
      const cached = loadMenuCache();
      if (cached) {
        setMenuItems(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      try {
        const items = await fetchMenu();
        if (!isMounted) return;
        if (items.length > 0) {
          const normalized = items.map(normalizeMenuItem);
          setMenuItems(normalized);
          saveMenuCache(normalized);
        } else if (!cached) {
          setMenuItems([]);
        }
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        if (!cached) {
          setMenuItems([]);
          setError(err instanceof Error ? err.message : String(err));
        }
        // If we already loaded from cache above, stay silent — menu is still visible
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    load();

    // Supabase Realtime: refresh menu when items change in DB
    const restaurantId = getRestaurantId();
    if (restaurantId) {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase
        .channel(`menu-realtime-${restaurantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` },
          () => { if (isMounted) refresh(); }
        )
        .subscribe();
    }

    // Re-load when restaurant changes (e.g. QR scan)
    const handleRestaurantChange = () => { if (isMounted) refresh(); };
    window.addEventListener('restaurantIdChanged', handleRestaurantChange);

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      window.removeEventListener('restaurantIdChanged', handleRestaurantChange);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ menuItems, categories, isLoading, error, refresh, saveMenu }),
    [menuItems, categories, isLoading, error, refresh, saveMenu]
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}
