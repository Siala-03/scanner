import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Incremented on every mutation (addTable/removeTable). loadTables checks this
  // before committing its response so stale fetches don't overwrite fresh local state.
  const mutationCountRef = useRef(0);

  // Fetch tables from backend
  const loadTables = useCallback(async () => {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) {
      setTables([]);
      setIsLoading(false);
      return;
    }

    // Show cached tables immediately so the grid never flashes "Loading…" when
    // the component remounts (e.g. supervisor navigating to/from Take Order).
    const cachedTables = getStoredTables(restaurantId);
    if (cachedTables.length > 0) {
      setTables(cachedTables);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const mutationAtStart = mutationCountRef.current;

    try {
      const backendTables = await fetchTables();

      // If a mutation happened while we were waiting, discard the stale response
      if (mutationCountRef.current !== mutationAtStart) return;

      // Re-read localStorage in case a mutation updated it while we were fetching
      const freshLocal = getStoredTables(restaurantId);

      if (backendTables.length > 0) {
        const merged = [...new Set([...backendTables.map(t => t.table_number), ...freshLocal])].sort((a, b) => a - b);
        setTables(merged);
        setStoredTables(restaurantId, merged);
      } else {
        // fetchTables now throws on error, so an empty array means the restaurant
        // genuinely has no tables. Clear stale localStorage to stay in sync.
        setTables([]);
        setStoredTables(restaurantId, []);
      }
    } catch (err) {
      // Network / RLS error — preserve whatever is currently showing.
      // Don't wipe cached or locally-added tables just because the fetch failed.
      console.warn('Failed to fetch tables from backend, using local storage:', err);
      const freshLocal = getStoredTables(restaurantId);
      if (freshLocal.length > 0) setTables(freshLocal);
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

  // Listen for table mutations from other hook instances (e.g. manager QR page → supervisor take-order).
  // Sync from localStorage (already updated by the mutating instance) to avoid a backend re-fetch race
  // where the backend response arrives before the DB commit and wipes the optimistic state.
  useEffect(() => {
    const handleTablesUpdated = () => {
      const restaurantId = resolveRestaurantId();
      if (!restaurantId) return;
      const localTables = getStoredTables(restaurantId);
      setTables(localTables);
    };
    window.addEventListener('tablesUpdated', handleTablesUpdated);
    return () => {
      window.removeEventListener('tablesUpdated', handleTablesUpdated);
    };
  }, []);

  // Add table
  const addTable = async () => {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) throw new Error('No restaurant context');

    mutationCountRef.current++;

    // Fetch fresh DB state so we never collide with tables added from another session.
    let ownNumbers: number[] = tables;
    try {
      const backendTables = await fetchTables();
      ownNumbers = backendTables.map(t => t.table_number);
      const merged = [...new Set([...ownNumbers, ...tables])].sort((a, b) => a - b);
      setTables(merged);
      setStoredTables(restaurantId, merged);
    } catch { /* use cached local state if fetch fails */ }

    const nextTableNumber = getNextAvailableTableNumber(ownNumbers);
    const optimistic = [...new Set([...ownNumbers, nextTableNumber])].sort((a, b) => a - b);

    setTables(optimistic);
    setStoredTables(restaurantId, optimistic);

    try {
      await createTable(nextTableNumber);
      window.dispatchEvent(new CustomEvent('tablesUpdated'));
    } catch (err) {
      const rolledBack = optimistic.filter(t => t !== nextTableNumber);
      setTables(rolledBack);
      setStoredTables(restaurantId, rolledBack);
      console.error('useTables: Failed to add table:', err);
      throw err;
    }
  };

  // Remove table
  const removeTable = async (tableNumber: number) => {
    const restaurantId = resolveRestaurantId();
    if (!restaurantId) throw new Error('No restaurant context');

    mutationCountRef.current++;
    try {
      // Try to delete from backend
      try {
        const allTables = await fetchTables();
        const tableToDelete = allTables.find(
          (t) => t.table_number === tableNumber
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
