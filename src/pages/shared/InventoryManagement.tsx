import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangleIcon, PackageIcon, RefreshCcwIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SearchBar } from '../../components/ui/SearchBar';
import { formatPrice } from '../../utils/currency';
import { menuItems } from '../../data/menuData';
import {
  ensureInventoryInitialized,
  listLowStock,
  loadInventoryMap,
  saveInventoryMap
} from '../../utils/inventoryStorage';

export function InventoryManagement() {
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    ensureInventoryInitialized(menuItems);
  }, []);

  const inventoryRows = useMemo(() => {
    const map = loadInventoryMap();
    const q = query.trim().toLowerCase();
    return menuItems
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
      .map((item) => {
        const rec = map[item.id]!;
        return {
          item,
          stock: rec?.stock ?? 0,
          lowStockThreshold: rec?.lowStockThreshold ?? 0,
          isLow: (rec?.stock ?? 0) <= (rec?.lowStockThreshold ?? 0)
        };
      })
      .sort((a, b) => Number(b.isLow) - Number(a.isLow) || a.item.name.localeCompare(b.item.name));
  }, [query, tick]);

  const low = useMemo(() => listLowStock(menuItems), [tick]);

  const update = (menuItemId: string, patch: Partial<{ stock: number; lowStockThreshold: number }>) => {
    const map = loadInventoryMap();
    const existing = map[menuItemId];
    if (!existing) return;
    map[menuItemId] = {
      ...existing,
      stock: patch.stock !== undefined ? Math.max(0, Math.floor(patch.stock)) : existing.stock,
      lowStockThreshold:
        patch.lowStockThreshold !== undefined
          ? Math.max(0, Math.floor(patch.lowStockThreshold))
          : existing.lowStockThreshold,
      updatedAt: new Date().toISOString()
    };
    saveInventoryMap(map);
    setTick((t) => t + 1);
  };

  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <PackageIcon className="w-6 h-6 text-amber-400" />
              Inventory
            </h1>
            <p className="text-slate-400 text-sm">
              Stock updates automatically when customers place orders.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setTick((t) => t + 1)}>
            <RefreshCcwIcon className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {low.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-red-300 font-semibold">Low stock alert</p>
              <p className="text-red-200/80">
                {low.slice(0, 3).map((x) => `${x.item.name} (${x.stock})`).join(', ')}
                {low.length > 3 ? ` +${low.length - 3} more` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <SearchBar value={query} onChange={setQuery} placeholder="Search item..." className="md:w-96" />
        </div>

        <Card className="bg-slate-800/50 backdrop-blur border border-slate-700/50" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Low at</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {inventoryRows.map((row) => (
                  <tr key={row.item.id} className={row.isLow ? 'bg-red-500/5' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{row.item.emoji}</span>
                        <div>
                          <p className="text-white font-medium">{row.item.name}</p>
                          <p className="text-xs text-slate-400">{row.item.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{formatPrice(row.item.price)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={row.stock}
                        onChange={(e) => update(row.item.id, { stock: parseInt(e.target.value || '0', 10) })}
                        className="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        min={0}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={row.lowStockThreshold}
                        onChange={(e) =>
                          update(row.item.id, { lowStockThreshold: parseInt(e.target.value || '0', 10) })
                        }
                        className="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        min={0}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {row.isLow ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
                          Low
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-300 border border-green-500/20">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

