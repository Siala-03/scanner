import { useState, useEffect, useCallback } from 'react';
import { fetchTables, createTable, deleteTable } from '../api/tables';

const resolveRestaurantId = (): string | undefined => {
  const direct = localStorage.getItem('restaurantId');
  if (direct && direct.trim()) return direct;

  const authUserRaw = localStorage.getItem('authUser');
  if (!authUserRaw) return undefined;

  try {
    const authUser = JSON.parse(authUserRaw);
    const fallback = authUser?.restaurantId || authUser?.restaurant_id;
    if (typeof fallback === 'string' && fallback.trim()) {
      localStorage.setItem('restaurantId', fallback);
      return fallback;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const tablesStorageKey = (restaurantId: string) => `scanner_tables:${restaurantId}`;

// Helper functions for localStorage
const getStoredTables = (restaurantId?: string): number[] => {
  if (!restaurantId) return [];
  try {
    const scoped = localStorage.getItem(tablesStorageKey(restaurantId));
    return scoped ? JSON.parse(scoped) : [];
  } catch {
    return [];
  }
};

const setStoredTables = (restaurantId: string | undefined, tables: number[]) => {
  if (!restaurantId) return;
  try {
    localStorage.setItem(tablesStorageKey(restaurantId), JSON.stringify(tables));
  } catch (error) {
    console.warn('Failed to store tables in localStorage:', error);
  }
};

const getNextAvailableTableNumber = (tableNumbers: number[]): number => {
  const used = new Set(
    tableNumbers
      .filter((n) => Number.isInteger(n) && n > 0)
      .map((n) => Number(n))
  );

  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }

  return candidate;
};

// Hook to get tables from backend
export function useTables() {
  const [tables, setTables] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch tables from backend
  const loadTables = useCallback(async () => {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) {
      setTables([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const backendTables = await fetchTables();
      if (backendTables && backendTables.length > 0) {
        const tableNumbers = backendTables.map(t => t.tableNumber || t.table_number);
        setTables(tableNumbers);
        setStoredTables(restaurantId, tableNumbers); // Also store locally
      } else {
        // If no backend tables, use locally stored ones
        const localTables = getStoredTables(restaurantId);
        setTables(localTables);
      }
    } catch (err) {
      console.warn('Failed to fetch tables from backend, using local storage:', err);
      // Fall back to locally stored tables
      const localTables = getStoredTables(restaurantId);
      setTables(localTables);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTables();

    const handleRestaurantChange = () => {
      loadTables();
    };

    window.addEventListener('restaurantIdChanged', handleRestaurantChange);
    return () => {
      window.removeEventListener('restaurantIdChanged', handleRestaurantChange);
    };
  }, [loadTables]);

  // Listen for table mutations from other hook instances (e.g. manager QR page → supervisor take-order)
  useEffect(() => {
    const handleTablesUpdated = () => {
      loadTables();
    };
    window.addEventListener('tablesUpdated', handleTablesUpdated);
    return () => {
      window.removeEventListener('tablesUpdated', handleTablesUpdated);
    };
  }, [loadTables]);

  // Add table
  const addTable = async () => {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) throw new Error('No restaurant context');

    try {
      console.log('useTables: Adding table...');
      const nextTableNumber = getNextAvailableTableNumber(tables);
      console.log('useTables: Next table number:', nextTableNumber);

      // Always update local state first for immediate UI feedback
      const newTables = [...tables, nextTableNumber].sort((a, b) => a - b);
      setTables(newTables);
      setStoredTables(restaurantId, newTables);
      console.log('useTables: Local state updated');

      // Try to create table in backend
      try {
        await createTable(nextTableNumber);
        console.log('useTables: Table created in backend');
      } catch (backendError) {
        console.warn('useTables: Backend not available, table stored locally only:', backendError);
      }

      // Notify other useTables instances to reload
      window.dispatchEvent(new CustomEvent('tablesUpdated'));
    } catch (err) {
      console.error('useTables: Failed to add table:', err);
      throw err;
    }
  };

  // Remove table
  const removeTable = async (tableNumber: number) => {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) throw new Error('No restaurant context');

    try {
      // Try to delete from backend
      try {
        const allTables = await fetchTables();
        const tableToDelete = allTables.find(
          (t) => (t.tableNumber ?? t.table_number) === tableNumber
        );
        if (tableToDelete) {
          await deleteTable(tableToDelete.id);
        }
      } catch (backendError) {
        console.warn('Backend not available for table deletion:', backendError);
      }

      // Always update local state and storage
      const newTables = tables.filter(t => t !== tableNumber);
      setTables(newTables);
      setStoredTables(restaurantId, newTables);

      // Notify other useTables instances to reload
      window.dispatchEvent(new CustomEvent('tablesUpdated'));
    } catch (err) {
      console.error('Failed to delete table:', err);
      throw err;
    }
  };

  return {
    tables,
    isLoading,
    addTable,
    removeTable,
    refetch: loadTables
  };
}
