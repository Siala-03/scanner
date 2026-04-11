import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../hooks/useMenu', () => ({
  useMenu: () => ({
    menuItems: [
      { id: 'item-1', name: 'Tomato', category: 'produce' },
      { id: 'item-2', name: 'Cheese', category: 'dairy' },
    ],
  }),
}));

vi.mock('../api/inventory', async () => {
  const actual = await vi.importActual('../api/inventory');
  return {
    ...actual,
    fetchInventory: vi.fn(async () => [
      { menuItemId: 'item-1', stock: 15, lowStockThreshold: 5, reorderPoint: 8, reorderQty: 20, unitCost: 150, supplierId: 'sup-1', location: 'Fridge', updatedAt: new Date().toISOString() },
      { menuItemId: 'item-2', stock: 0, lowStockThreshold: 3, reorderPoint: 10, reorderQty: 30, unitCost: 250, supplierId: 'sup-1', location: 'Cold Room', updatedAt: new Date().toISOString() },
    ]),
    fetchLowStockItems: vi.fn(async () => []),
    fetchSuppliers: vi.fn(async () => []),
    fetchPurchaseOrders: vi.fn(async () => []),
    fetchMovements: vi.fn(async () => []),
    fetchWasteEntries: vi.fn(async () => ({ totals: { total_cost: 0 }, byReason: [], topItems: [], topReason: null })),
    computeInventoryAnalytics: vi.fn(async () => ({
      totalStockValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      pendingPOCount: 0,
      pendingPOValue: 0,
      wasteCostLast30d: 0,
      avgTurnoverDays: 0,
      belowReorderCount: 0,
      topWasteReason: null,
      wasteByReason: [],
      topWasteItems: [],
      stockTurnoverRate: 0,
      categoryBreakdown: [],
    })),
  };
});

import { InventoryManagement } from '../pages/shared/InventoryManagement';

describe('InventoryManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the inventory table headers and items', async () => {
    render(<InventoryManagement role="manager" />);

    expect(await screen.findByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Stock Level')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Cheese')).toBeInTheDocument();
    });
  });

  it('shows low-out status for out-of-stock items', async () => {
    render(<InventoryManagement role="manager" />);

    await waitFor(() => {
      expect(screen.getByText('Out of Stock')).toBeInTheDocument();
      expect(screen.getByText('In Stock')).toBeInTheDocument();
    });
  });
});
