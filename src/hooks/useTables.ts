import { useState, useEffect, useCallback } from 'react';
import { fetchTables, createTable, deleteTable, Table } from '../api/tables';

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
        setTables(backendTables.map(t => t.table_number));
      }
    } catch (err) {
      console.warn('Failed to fetch tables from backend:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // Add table
  const addTable = async (tableNumber: number) => {
    try {
      await createTable(tableNumber);
      setTables(prev => [...prev, tableNumber].sort((a, b) => a - b));
    } catch (err) {
      console.error('Failed to create table:', err);
      throw err;
    }
  };

  // Remove table
  const removeTable = async (tableNumber: number) => {
    try {
      const allTables = await fetchTables();
      const tableToDelete = allTables.find(t => t.table_number === tableNumber);
      if (tableToDelete) {
        await deleteTable(tableToDelete.id);
      }
      setTables(prev => prev.filter(t => t !== tableNumber));
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
