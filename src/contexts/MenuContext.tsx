import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuItem } from '../types';
import { fetchMenu, uploadMenu } from '../api/menu';
import { getSocket } from '../hooks/useSocket';
import { menuItems as defaultMenuItems } from '../data/menuData';
import { loadCustomMenu } from '../utils/menuImportExport';

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
  if (!ctx) {
    throw new Error('useMenuContext must be used inside <MenuProvider>');
  }
  return ctx;
}

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFallbackMenu = useCallback(() => {
    const storedMenu = loadCustomMenu();
    if (storedMenu && storedMenu.length > 0) {
      setMenuItems(storedMenu);
      setError(null);
      return true;
    }
    return false;
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const menu = await fetchMenu();
      if (menu.length > 0) {
        setMenuItems(menu);
      } else if (!loadFallbackMenu()) {
        setMenuItems(defaultMenuItems);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to refresh menu:', err);
      if (!loadFallbackMenu()) {
        setMenuItems(defaultMenuItems);
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [loadFallbackMenu]);

  const saveMenu = useCallback(async (items: MenuItem[]) => {
    setIsLoading(true);
    try {
      await uploadMenu(items);
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
    const restaurantIdRef = { current: getRestaurantId() };

    const load = async () => {
      setIsLoading(true);
      try {
        const items = await fetchMenu();
        if (!isMounted) return;

        if (items.length > 0) {
          setMenuItems(items);
        } else if (!loadFallbackMenu()) {
          setMenuItems(defaultMenuItems);
        }
        setError(null);
      } catch (err) {
        console.error('Failed to load menu from API:', err);
        // Log API URL for debugging
        const apiUrl = import.meta.env.VITE_API_URL || '(using relative path)';
        console.warn('API URL being used:', apiUrl);
        if (!isMounted) return;
        if (!loadFallbackMenu()) {
          setMenuItems(defaultMenuItems);
        }
        setError(err instanceof Error ? err.message : 'Unable to load menu');
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };

    const checkRestaurantId = async () => {
      const currentId = getRestaurantId();
      if (currentId !== restaurantIdRef.current) {
        restaurantIdRef.current = currentId;
        await refresh();
      }
    };

    load();

    const socket = getSocket();
    const handleMenuUpdate = () => {
      refresh();
    };
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'restaurantId') {
        checkRestaurantId();
      }
    };

    try {
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit('join:menu');
      socket.on('menu:update', handleMenuUpdate);
      socket.on('menu:changed', handleMenuUpdate);
      window.addEventListener('restaurantIdChanged', checkRestaurantId);
      window.addEventListener('storage', handleStorageEvent);
      window.addEventListener('popstate', checkRestaurantId);
    } catch (err) {
      console.warn('Socket connect failed:', err);
    }

    return () => {
      isMounted = false;
      socket.off('menu:update', handleMenuUpdate);
      socket.off('menu:changed', handleMenuUpdate);
      window.removeEventListener('restaurantIdChanged', checkRestaurantId);
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('popstate', checkRestaurantId);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ menuItems, categories, isLoading, error, refresh, saveMenu }),
    [menuItems, categories, isLoading, error, refresh, saveMenu]
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}
