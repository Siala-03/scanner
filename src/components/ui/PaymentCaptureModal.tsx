import { useState } from 'react';
import {
  BanknoteIcon, SmartphoneIcon, CreditCardIcon, BuildingIcon,
  XIcon, CheckCircleIcon,
} from 'lucide-react';
import type { PaymentEntry } from '../../utils/receipt';

const METHODS = [
  { id: 'Cash',          label: 'Cash',          icon: BanknoteIcon,   hasRef: false },
  { id: 'Mobile Money',  label: 'MOMO',          icon: SmartphoneIcon, hasRef: true  },
  { id: 'Card',          label: 'Card',          icon: CreditCardIcon, hasRef: true  },
  { id: 'Bank Transfer', label: 'Bank Transfer', icon: BuildingIcon,   hasRef: true  },
];

interface EntryDraft {
  method: string;
  amount: string;
  reference: string;
}

interface PaymentCaptureModalProps {
  total: number;
  currency?: 'RWF' | 'USD';
  onConfirm: (payments: PaymentEntry[], change: number) => void;
  onCancel: () => void;
}

export function PaymentCaptureModal({
  total,
  currency = 'RWF',
  onConfirm,
  onCancel,
}: PaymentCaptureModalProps) {
  const [entries, setEntries] = useState<EntryDraft[]>([
    { method: 'Cash', amount: String(Math.round(total)), reference: '' },
  ]);

  const fmt = (v: number) =>
    currency === 'RWF'
      ? 'RWF ' + Math.round(v).toLocaleString('en-US')
      : '$' + v.toFixed(2);

  const totalPaid = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const change = Math.max(0, totalPaid - total);
  const remaining = Math.max(0, total - totalPaid);
  const canConfirm = totalPaid >= total && entries.every(e => parseFloat(e.amount) > 0);

  const isActive = (method: string) => entries.some(e => e.method === method);

  const toggleMethod = (method: string) => {
    if (isActive(method)) {
      if (entries.length === 1) return; // keep at least one
      setEntries(prev => prev.filter(e => e.method !== method));
    } else {
      const currentTotal = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const rem = Math.max(0, total - currentTotal);
      setEntries(prev => [
        ...prev,
        { method, amount: rem > 0 ? String(Math.round(rem)) : '', reference: '' },
      ]);
    }
  };

  const updateEntry = (method: string, field: 'amount' | 'reference', value: string) => {
    setEntries(prev => prev.map(e => e.method === method ? { ...e, [field]: value } : e));
  };

  const handleConfirm = () => {
    const payments: PaymentEntry[] = entries
      .filter(e => parseFloat(e.amount) > 0)
      .map(e => ({
        method: e.method,
        amount: parseFloat(e.amount),
        reference: e.reference.trim() || undefined,
      }));
    onConfirm(payments, change);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-100 text-base">Payment</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Total due: <span className="font-bold text-white">{fmt(total)}</span>
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Method chips */}
          <div className="flex gap-2 flex-wrap">
            {METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => toggleMethod(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                  isActive(id)
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Entry rows */}
          <div className="space-y-2">
            {entries.map((entry) => {
              const meta = METHODS.find(m => m.id === entry.method);
              const Icon = meta?.icon || BanknoteIcon;
              return (
                <div key={entry.method} className="bg-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-200 flex-1">{entry.method}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 shrink-0">{currency}</span>
                      <input
                        type="number"
                        min="0"
                        step={currency === 'RWF' ? '100' : '0.01'}
                        value={entry.amount}
                        onChange={e => updateEntry(entry.method, 'amount', e.target.value)}
                        className="w-28 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-right text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  {meta?.hasRef && (
                    <input
                      type="text"
                      placeholder="Transaction ID / Reference (optional)"
                      value={entry.reference}
                      onChange={e => updateEntry(entry.method, 'reference', e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-slate-800/60 rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Total Paid</span>
              <span className={`font-bold ${totalPaid >= total ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(totalPaid)}
              </span>
            </div>
            {change > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Change</span>
                <span className="font-bold text-amber-300">{fmt(change)}</span>
              </div>
            )}
            {remaining > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Remaining</span>
                <span className="font-bold text-red-400">{fmt(remaining)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircleIcon className="w-4 h-4" />
              Confirm &amp; Print
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
