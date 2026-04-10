import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MenuItem } from '../types';
import { fetchMenu, uploadMenu } from '../api/menu';
import { getSocket } from '../hooks/useSocket';
import { menuItems as defaultMenuItems } from '../data/menuData';
import { loadCustomMenu } from '../utils/menuImportExport';

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

    load();

    const socket = getSocket();
    try {
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit('join:menu');
      const handleMenuUpdate = () => {
        refresh();
      };
      socket.on('menu:update', handleMenuUpdate);
      socket.on('menu:changed', handleMenuUpdate);
      return () => {
        isMounted = false;
        socket.off('menu:update', handleMenuUpdate);
        socket.off('menu:changed', handleMenuUpdate);
      };
    } catch (err) {
      console.warn('Socket connect failed:', err);
    }

    return () => {
      isMounted = false;
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ menuItems, categories, isLoading, error, refresh, saveMenu }),
    [menuItems, categories, isLoading, error, refresh, saveMenu]
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}
