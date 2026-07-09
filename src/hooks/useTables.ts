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

    const mutationAtStart = mutationCountRef.current;

    try {
      setIsLoading(true);
      const backendTables = await fetchTables();

      // If a mutation happened while we were waiting, discard the stale response
      if (mutationCountRef.current !== mutationAtStart) return;

      // Merge backend + localStorage so optimistically-added tables are never lost.
      const localTables = getStoredTables(restaurantId);
      if (backendTables && backendTables.length > 0) {
        const backendNumbers = backendTables.map(t => t.table_number);
        const merged = [...new Set([...backendNumbers, ...localTables])].sort((a, b) => a - b);
        setTables(merged);
        // Persist the merged list so it's available when offline.
        setStoredTables(restaurantId, merged);
      } else {
        // Backend has no tables — trust localStorage
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

    // Fetch fresh DB state first so we don't pick a number already used by this restaurant.
    let ownNumbers: number[] = tables;
    try {
      const backendTables = await fetchTables();
      ownNumbers = backendTables.map(t => t.table_number);
      const merged = [...new Set([...ownNumbers, ...tables])].sort((a, b) => a - b);
      setTables(merged);
      setStoredTables(restaurantId, merged);
    } catch { /* fall back to cached local state */ }

    // The table_number column has a global unique constraint across all restaurants.
    // If the chosen number collides, increment and retry until one succeeds.
    const globally_taken = new Set(ownNumbers);
    const MAX_ATTEMPTS = 50;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const nextTableNumber = getNextAvailableTableNumber([...globally_taken]);

      const optimistic = [...new Set([...ownNumbers, nextTableNumber])].sort((a, b) => a - b);
      setTables(optimistic);
      setStoredTables(restaurantId, optimistic);

      try {
        await createTable(nextTableNumber);
        window.dispatchEvent(new CustomEvent('tablesUpdated'));
        return;
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          // Number is taken globally — mark it and try the next one
          globally_taken.add(nextTableNumber);
          const rolledBack = optimistic.filter(t => t !== nextTableNumber);
          setTables(rolledBack);
          setStoredTables(restaurantId, rolledBack);
          continue;
        }
        // Any other error — restore state and surface it
        const rolledBack = optimistic.filter(t => t !== nextTableNumber);
        setTables(rolledBack);
        setStoredTables(restaurantId, rolledBack);
        console.error('useTables: Failed to add table:', err);
        throw err;
      }
    }

    throw new Error('Could not find a free table number after several attempts. Please try again.');
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
