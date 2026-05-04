import { useState, useEffect, useCallback } from 'react';
import { fetchTables, createTable, deleteTable } from '../api/tables';

const TABLES_STORAGE_KEY = 'scanner_tables';

// Helper functions for localStorage
const getStoredTables = (): number[] => {
  try {
    const stored = localStorage.getItem(TABLES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setStoredTables = (tables: number[]) => {
  try {
    localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(tables));
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
    try {
      setIsLoading(true);
      const backendTables = await fetchTables();
      if (backendTables && backendTables.length > 0) {
        const tableNumbers = backendTables.map(t => t.tableNumber || t.table_number);
        setTables(tableNumbers);
        setStoredTables(tableNumbers); // Also store locally
      } else {
        // If no backend tables, use locally stored ones
        const localTables = getStoredTables();
        setTables(localTables);
      }
    } catch (err) {
      console.warn('Failed to fetch tables from backend, using local storage:', err);
      // Fall back to locally stored tables
      const localTables = getStoredTables();
      setTables(localTables);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // Add table
  const addTable = async () => {
    try {
      console.log('useTables: Adding table...');
      const nextTableNumber = getNextAvailableTableNumber(tables);
      console.log('useTables: Next table number:', nextTableNumber);

      // Always update local state first for immediate UI feedback
      const newTables = [...tables, nextTableNumber].sort((a, b) => a - b);
      setTables(newTables);
      setStoredTables(newTables);
      console.log('useTables: Local state updated');

      // Try to create table in backend
      try {
        await createTable(nextTableNumber);
        console.log('useTables: Table created in backend');
      } catch (backendError) {
        console.warn('useTables: Backend not available, table stored locally only:', backendError);
        // Table is already added locally, so this is fine
      }
    } catch (err) {
      console.error('useTables: Failed to add table:', err);
      throw err;
    }
  };

  // Remove table
  const removeTable = async (tableNumber: number) => {
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
      setStoredTables(newTables);
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
