import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MenuItem } from '../types';
import { fetchMenu, uploadMenu } from '../api/menu';
import { getSocket } from '../hooks/useSocket';

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

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const menu = await fetchMenu();
      setMenuItems(menu || []);
      setError(null);
    } catch (err) {
      console.error('Failed to refresh menu:', err);
      setMenuItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        setMenuItems(items || []);
        setError(null);
      } catch (err) {
        console.error('Failed to load menu:', err);
        if (!isMounted) return;
        setMenuItems([]);
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
