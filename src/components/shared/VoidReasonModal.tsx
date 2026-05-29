import { useState } from 'react';
import { AlertTriangleIcon, XIcon } from 'lucide-react';

const PRESET_REASONS = [
  'Customer changed mind',
  'Wrong order placed',
  'Item unavailable / out of stock',
  'Customer left without paying',
  'Duplicate order / entry error',
  'Allergy or dietary concern',
] as const;

interface VoidReasonModalProps {
  orderLabel: string;           // e.g. "Order #ABC1234 — Table 5"
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function VoidReasonModal({
  orderLabel,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: VoidReasonModalProps) {
  const [selected, setSelected] = useState('');
  const [customReason, setCustomReason] = useState('');

  const isOther = selected === 'Other';
  const effectiveReason = isOther ? customReason.trim() : selected;
  const canSubmit = effectiveReason.length > 0 && !isSubmitting;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(effectiveReason);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-700">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangleIcon className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Void Order</h2>
              <p className="text-xs text-slate-400 mt-0.5">{orderLabel}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Reason for voiding <span className="text-red-400">*</span>
            </label>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setCustomReason('');
              }}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
            >
              <option value="" disabled>Select a reason…</option>
              {PRESET_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="Other">Other (please specify)</option>
            </select>
          </div>

          {isOther && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Specify reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason for voiding this order…"
                rows={3}
                autoFocus
                className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-red-500 placeholder-slate-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {isSubmitting ? 'Voiding…' : 'Void Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
