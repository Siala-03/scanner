import { useState, useEffect, useCallback } from 'react';
import type { MenuItem } from '../types';
import { menuItems as defaultMenuItems } from '../data/menuData';
import { fetchMenu } from '../api/menu';
import { getSocket } from './useSocket';

// Hook to get menu from backend with real-time sync
export function useMenu() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>(defaultMenuItems);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch menu from backend
  const loadMenu = useCallback(async () => {
    try {
      setIsLoading(true);
      const backendMenu = await fetchMenu();
      if (backendMenu && backendMenu.length > 0) {
        setMenuItems(backendMenu);
      }
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch menu from backend:', err);
      // Keep using local menu on error
      setError('Using offline menu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for menu updates via WebSocket
  useEffect(() => {
    // Initial load
    loadMenu();

    // Listen for menu updates
    const socket = getSocket();
    
    const handleMenuUpdate = () => {
      console.log('Menu update received, reloading...');
      loadMenu();
    };

    socket.on('menu:update', handleMenuUpdate);
    socket.on('menu:changed', handleMenuUpdate);

    return () => {
      socket.off('menu:update', handleMenuUpdate);
      socket.off('menu:changed', handleMenuUpdate);
    };
  }, [loadMenu]);

  // Get unique categories from menu
  const categories = Array.from(new Set(menuItems.map(item => item.category)));

  return {
    menuItems,
    categories,
    isLoading,
    error,
    refetch: loadMenu
  };
}
