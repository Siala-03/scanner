import { useState } from 'react';
import {
  XIcon, AlertTriangleIcon, RefreshCwIcon,
  RotateCcwIcon, CheckCircleIcon,
} from 'lucide-react';
import { formatPrice } from '../../utils/currency';

export interface RefundableTxn {
  id: string;
  orderNumber: string;
  total: number;
  paymentLabel: string;
  items: Array<{ name: string; qty: number; price: number }>;
}

interface RefundModalProps {
  txn: RefundableTxn;
  onConfirm: (params: { refundAmount: number; reason: string }) => Promise<void>;
  onCancel: () => void;
}

const REFUND_REASONS = [
  'Wrong item',
  'Damaged product',
  'Customer changed mind',
  'Overcharge error',
  'Out of stock after payment',
  'Other',
];

export function RefundModal({ txn, onConfirm, onCancel }: RefundModalProps) {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refundAmount =
    refundType === 'full'
      ? txn.total
      : Math.min(parseFloat(customAmount || '0'), txn.total);

  const finalReason = reason === 'Other' ? customReason.trim() : reason;

  const handleConfirm = async () => {
    if (refundAmount <= 0) { setError('Refund amount must be greater than 0.'); return; }
    if (!finalReason) { setError('Please select or enter a reason.'); return; }
    setSaving(true);
    setError('');
    try {
      await onConfirm({ refundAmount, reason: finalReason });
    } catch (err: any) {
      setError(err?.message ?? 'Refund failed. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
            <RotateCcwIcon className="w-4 h-4 text-orange-400" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-white text-sm">Process Refund</p>
            <p className="text-xs text-slate-500 mt-0.5">Order #{txn.orderNumber}</p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Order summary */}
          <div className="bg-slate-800/50 rounded-2xl p-3 space-y-1.5 max-h-32 overflow-y-auto">
            {txn.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-slate-300">{item.name} <span className="text-slate-500">×{item.qty}</span></span>
                <span className="text-slate-400 font-medium">{formatPrice(item.price)}</span>
              </div>
            ))}
            <div className="border-t border-slate-700 pt-1.5 flex justify-between text-xs">
              <span className="text-slate-400 font-semibold">Total paid ({txn.paymentLabel})</span>
              <span className="text-white font-bold">{formatPrice(txn.total)}</span>
            </div>
          </div>

          {/* Refund type */}
          <div className="grid grid-cols-2 gap-2">
            {(['full', 'partial'] as const).map((type) => (
              <button
                key={type}
                onClick={() => { setRefundType(type); setError(''); }}
                className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  refundType === type
                    ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300'
                    : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {type === 'full'
                  ? `Full Refund (${formatPrice(txn.total)})`
                  : 'Partial Refund'}
              </button>
            ))}
          </div>

          {refundType === 'partial' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Refund amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-medium">RWF</span>
                <input
                  type="number"
                  min="1"
                  max={txn.total}
                  step="100"
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setError(''); }}
                  placeholder="0"
                  className="w-full pl-12 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-orange-500/60 transition-all placeholder-slate-600"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Reason *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {REFUND_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => { setReason(r); setError(''); }}
                  className={`py-2 px-2.5 rounded-xl text-xs text-left transition-all ${
                    reason === r
                      ? 'bg-orange-500/20 border border-orange-500/35 text-orange-300'
                      : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Other' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason…"
                className="mt-2 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                autoFocus
              />
            )}
          </div>

          {/* Refund summary */}
          {refundAmount > 0 && finalReason && (
            <div className="flex items-center justify-between bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2.5">
              <span className="text-xs text-orange-400">Refund amount</span>
              <span className="text-sm font-black text-orange-300">{formatPrice(refundAmount)}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
              <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || refundAmount <= 0}
              className="flex-1 py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><RefreshCwIcon className="w-4 h-4 animate-spin" /> Processing…</>
              ) : (
                <><CheckCircleIcon className="w-4 h-4" /> Refund</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
