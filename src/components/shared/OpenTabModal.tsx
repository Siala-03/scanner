import { useEffect } from 'react';
import { ClockIcon, PlusCircleIcon, ReceiptTextIcon, XIcon } from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import type { Order } from '../../types';

interface OpenTabModalProps {
  tableNumber: number;
  candidate: Order;
  onAddToTab: () => void;
  onNewOrder: () => void;
}

function timeOpen(order: Order): string {
  const raw = (order as any).createdAt ?? (order as any).created_at;
  if (!raw) return '';
  const ms = Date.now() - new Date(raw).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

function normaliseItems(raw: unknown): Array<{ name: string; qty: number; unitPrice: number }> {
  const arr: any[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
    : [];

  return arr.map((item: any) => ({
    name: item.menuItemName ?? item.menu_item_name ?? item.menuItem?.name ?? item.name ?? 'Item',
    qty: Number(item.quantity ?? 1),
    unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.menuItem?.price ?? 0),
  }));
}

export function OpenTabModal({ tableNumber, candidate, onAddToTab, onNewOrder }: OpenTabModalProps) {
  const items = normaliseItems(candidate.items);
  const orderNumber = String(
    (candidate as any).orderNumber ?? (candidate as any).order_number ?? candidate.id ?? ''
  ).slice(0, 7).toUpperCase();
  const opened = timeOpen(candidate);
  const total = candidate.total ?? 0;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onNewOrder(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewOrder]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Open Tab</p>
            <h2 className="text-lg font-bold text-white mt-0.5">Table {tableNumber}</h2>
            <p className="text-xs text-slate-400 mt-0.5">#{orderNumber}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-full mt-1">
            <ClockIcon className="w-3 h-3" />
            <span>{opened}</span>
          </div>
        </div>

        {/* Items */}
        <div className="px-5 py-3 max-h-48 overflow-y-auto space-y-1.5">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No items recorded</p>
          ) : (
            items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  <span className="font-semibold text-slate-200">{item.qty}×</span>{' '}
                  {item.name}
                </span>
                <span className="text-slate-400 ml-4 shrink-0">
                  {formatPrice(item.unitPrice * item.qty)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700/60 bg-slate-800/40">
          <span className="text-sm text-slate-400 flex items-center gap-1.5">
            <ReceiptTextIcon className="w-3.5 h-3.5" />
            Current total
          </span>
          <span className="font-bold text-amber-300">{formatPrice(total)}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
          <button
            onClick={onAddToTab}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3 text-sm transition-colors"
          >
            <PlusCircleIcon className="w-4 h-4" />
            Add to this tab
          </button>
          <button
            onClick={onNewOrder}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-3 text-sm transition-colors"
          >
            <XIcon className="w-4 h-4" />
            Start separate order
          </button>
        </div>
      </div>
    </div>
  );
}
