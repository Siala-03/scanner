import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../lib/supabase', () => {
  const mockChannel = { on: () => mockChannel, subscribe: () => mockChannel, unsubscribe: () => {} };
  return {
    supabase: {
      from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
      channel: () => mockChannel,
      removeChannel: () => {},
    },
  };
});

vi.mock('../hooks/useMenu', () => ({
  useMenu: () => ({
    menuItems: [
      { id: 'item-1', name: 'Tomato', category: 'produce' },
      { id: 'item-2', name: 'Cheese', category: 'dairy' },
    ],
  }),
}));

vi.mock('../hooks/useInventory', () => ({
  useInventoryData: () => ({
    inventory: [
      { menuItemId: 'item-1', stock: 15, lowStockThreshold: 5, reorderPoint: 8, reorderQty: 20, unitCost: 150, supplierId: 'sup-1', location: 'Fridge', updatedAt: new Date().toISOString(), description: 'Fresh tomatoes', category: 'produce', currentQty: 15, cost: 150, price: 300, qtyStart: 20, expiryDate: '', purchaseDate: '' },
      { menuItemId: 'item-2', stock: 0, lowStockThreshold: 3, reorderPoint: 10, reorderQty: 30, unitCost: 250, supplierId: 'sup-1', location: 'Cold Room', updatedAt: new Date().toISOString(), description: 'Cheddar cheese', category: 'dairy', currentQty: 0, cost: 250, price: 500, qtyStart: 10, expiryDate: '', purchaseDate: '' },
    ],
    lowStockItems: [{ menuItemId: 'item-2', stock: 0 }],
    suppliers: [],
    purchaseOrders: [],
    movements: [],
    wasteData: { totals: { total_cost: 0 }, byReason: [], topItems: [], topReason: null },
    analytics: {
      totalStockValue: 0, lowStockCount: 1, outOfStockCount: 1, pendingPOCount: 0,
      pendingPOValue: 0, wasteCostLast30d: 0, avgTurnoverDays: 0, belowReorderCount: 0,
      topWasteReason: null, wasteByReason: [], topWasteItems: [], stockTurnoverRate: 0, categoryBreakdown: [],
    },
    locations: [],
    alerts: [],
    forecasts: [],
    forecastAlerts: [],
    isGeneratingForecasts: false,
    runForecasting: vi.fn(),
    isLoading: false,
    loadError: null,
    refresh: vi.fn(),
    upsertInventoryRecords: vi.fn(),
    removeInventoryRecord: vi.fn(),
    waste: { totals: { total_cost: 0 }, byReason: [], topItems: [], topReason: null },
  }),
}));

import { InventoryManagement } from '../pages/shared/InventoryManagement';

describe('InventoryManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the inventory table headers and items', async () => {
    render(<InventoryManagement role="manager" />);

    expect(await screen.findByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Current Qty')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Cheese')).toBeInTheDocument();
    });
  });

  it('shows out-of-stock count in analytics', async () => {
    render(<InventoryManagement role="manager" />);

    await waitFor(() => {
      expect(screen.getByText('Out of Stock')).toBeInTheDocument();
      expect(screen.getByText('Low Stock')).toBeInTheDocument();
    });
  });
});
