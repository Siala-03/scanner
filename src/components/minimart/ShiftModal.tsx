import { useState } from 'react';
import {
  ClockIcon, DollarSignIcon, TrendingUpIcon, XIcon,
  CheckCircleIcon, AlertTriangleIcon, RefreshCwIcon,
  LogInIcon, LogOutIcon, PrinterIcon,
} from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import type { CashierShift } from '../../api/shifts';

function printShiftSummary(params: {
  cashierName: string;
  restaurantName: string;
  openedAt: string;
  shiftHours: number;
  shiftMins: number;
  salesCount: number;
  totalRevenue: number;
  openingFloat: number;
  closingFloat: number;
  expectedCash: number;
  cashVariance: number;
  paymentBreakdown: Record<string, number>;
  notes: string;
}) {
  const varianceColour = params.cashVariance === 0 ? '#10b981' : params.cashVariance > 0 ? '#60a5fa' : '#f87171';
  const varianceLabel  = params.cashVariance === 0 ? 'Balanced' : params.cashVariance > 0 ? 'Overage' : 'Shortage';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Shift Summary</title>
<style>
  body{font-family:monospace;background:#fff;color:#111;width:300px;margin:0 auto;padding:12px;font-size:12px;}
  h1{text-align:center;font-size:14px;margin:0 0 4px;}
  .sub{text-align:center;font-size:11px;color:#555;margin-bottom:10px;}
  hr{border:none;border-top:1px dashed #aaa;margin:8px 0;}
  .row{display:flex;justify-content:space-between;margin:3px 0;}
  .label{color:#555;}
  .bold{font-weight:700;}
  .total{font-size:13px;font-weight:700;}
  .var{color:${varianceColour};font-weight:700;}
  .footer{text-align:center;font-size:10px;color:#888;margin-top:12px;}
</style></head><body>
<h1>${params.restaurantName}</h1>
<div class="sub">SHIFT SUMMARY REPORT</div>
<hr/>
<div class="row"><span class="label">Cashier</span><span class="bold">${params.cashierName}</span></div>
<div class="row"><span class="label">Shift Start</span><span>${new Date(params.openedAt).toLocaleString()}</span></div>
<div class="row"><span class="label">Duration</span><span>${params.shiftHours}h ${params.shiftMins}m</span></div>
<hr/>
<div class="row total"><span>Total Sales</span><span>${params.salesCount} txns</span></div>
<div class="row total"><span>Revenue</span><span>${formatPrice(params.totalRevenue)}</span></div>
<hr/>
<div class="label" style="margin-bottom:4px;">Payment Breakdown</div>
${Object.entries(params.paymentBreakdown).map(([m, v]) => `<div class="row"><span class="label">${m}</span><span>${formatPrice(v)}</span></div>`).join('')}
<hr/>
<div class="row"><span class="label">Opening Float</span><span>${formatPrice(params.openingFloat)}</span></div>
<div class="row"><span class="label">Cash Sales</span><span>${formatPrice(params.paymentBreakdown['Cash'] ?? 0)}</span></div>
<div class="row"><span class="label">Expected Cash</span><span class="bold">${formatPrice(params.expectedCash)}</span></div>
<div class="row"><span class="label">Counted Cash</span><span class="bold">${formatPrice(params.closingFloat)}</span></div>
<div class="row"><span class="label">Variance</span><span class="var">${params.cashVariance > 0 ? '+' : ''}${formatPrice(params.cashVariance)} (${varianceLabel})</span></div>
${params.notes ? `<hr/><div class="label">Notes</div><div style="margin-top:4px;">${params.notes}</div>` : ''}
<div class="footer">Printed ${new Date().toLocaleString()}</div>
</body></html>`;
  const win = window.open('', '_blank', 'width=360,height=640');
  if (!win) { alert('Allow pop-ups to print shift summary.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

interface ShiftTxnSummary {
  total: number;
  paymentLabel: string;
}

interface ShiftModalProps {
  mode: 'open' | 'close';
  cashierName: string;
  restaurantName: string;
  currentShift?: CashierShift;
  shiftTxns: ShiftTxnSummary[];
  shiftSales: { count: number; total: number };
  onOpen: (openingFloat: number) => Promise<void>;
  onClose: (params: { closingFloat: number; notes: string }) => Promise<void>;
  onCancelClose?: () => void;
}

export function ShiftModal({
  mode,
  cashierName,
  restaurantName,
  currentShift,
  shiftTxns,
  shiftSales,
  onOpen,
  onClose,
  onCancelClose,
}: ShiftModalProps) {
  const [openingFloat, setOpeningFloat] = useState('');
  const [closingFloat, setClosingFloat] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Open shift ───────────────────────────────────────────────────────────

  if (mode === 'open') {
    const handleOpen = async () => {
      setSaving(true);
      setError('');
      try {
        await onOpen(parseFloat(openingFloat || '0'));
      } catch (err: any) {
        setError(err?.message ?? 'Failed to open shift. Please try again.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/5 border-b border-amber-500/20 px-6 py-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <LogInIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Open Shift</p>
              <p className="text-xs text-amber-400 mt-0.5">{restaurantName}</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 bg-slate-800/60 rounded-2xl px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-300">
                {cashierName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs text-slate-500">Cashier</p>
                <p className="text-sm font-semibold text-white">{cashierName}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-500">Time</p>
                <p className="text-xs font-medium text-slate-300">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Opening Float (cash in drawer)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">RWF</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0"
                  className="w-full pl-14 pr-4 py-3 bg-slate-800 border border-slate-700/60 rounded-2xl text-white text-lg font-bold focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder-slate-600"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
                />
              </div>
              <p className="text-xs text-slate-600 mt-1.5">Enter 0 if starting with an empty drawer.</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
                <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleOpen}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-slate-900 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><RefreshCwIcon className="w-4 h-4 animate-spin" /> Opening…</>
              ) : (
                <><LogInIcon className="w-4 h-4" /> Open Shift</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Close shift ──────────────────────────────────────────────────────────

  const cashSales = shiftTxns
    .filter((t) => t.paymentLabel === 'Cash')
    .reduce((sum, t) => sum + t.total, 0);
  const openingFloat_ = currentShift?.openingFloat ?? 0;
  const expectedCash = openingFloat_ + cashSales;
  const counted = parseFloat(closingFloat || '0');
  const variance = counted - expectedCash;

  const shiftDurationMs = currentShift
    ? Date.now() - new Date(currentShift.openedAt).getTime()
    : 0;
  const shiftHours = Math.floor(shiftDurationMs / 3600000);
  const shiftMins  = Math.floor((shiftDurationMs % 3600000) / 60000);

  const paymentBreakdown = shiftTxns.reduce<Record<string, number>>((acc, t) => {
    acc[t.paymentLabel] = (acc[t.paymentLabel] ?? 0) + t.total;
    return acc;
  }, {});

  const handleClose = async () => {
    if (!closingFloat) { setError('Please enter the counted cash amount.'); return; }
    setSaving(true);
    setError('');
    try {
      await onClose({ closingFloat: counted, notes });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to close shift. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-md shadow-2xl my-4">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center gap-3 rounded-t-3xl">
          <div className="w-9 h-9 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center">
            <LogOutIcon className="w-4 h-4 text-slate-300" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-white text-sm">End Shift</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {cashierName} · {shiftHours}h {shiftMins}m
            </p>
          </div>
          <div className="text-right mr-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Started</p>
            <p className="text-xs font-medium text-slate-300">
              {currentShift ? new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
          </div>
          {onCancelClose && (
            <button onClick={onCancelClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Shift summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800/60 rounded-2xl p-3 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Sales</p>
              <p className="text-xl font-black text-white">{shiftSales.count}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
              <p className="text-[10px] text-emerald-600 uppercase tracking-wide mb-1">Revenue</p>
              <p className="text-sm font-black text-emerald-400">{formatPrice(shiftSales.total)}</p>
            </div>
            <div className="bg-slate-800/60 rounded-2xl p-3 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Float In</p>
              <p className="text-sm font-bold text-slate-300">{formatPrice(openingFloat_)}</p>
            </div>
          </div>

          {/* Payment breakdown */}
          {Object.keys(paymentBreakdown).length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-3 space-y-1.5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Payment Breakdown</p>
              {Object.entries(paymentBreakdown).map(([method, total]) => (
                <div key={method} className="flex justify-between text-xs">
                  <span className="text-slate-400">{method}</span>
                  <span className="font-semibold text-slate-200">{formatPrice(total)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Till reconciliation */}
          <div className="border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="bg-slate-800/40 px-4 py-2.5 flex items-center gap-2">
              <DollarSignIcon className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Till Reconciliation</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Opening float</span>
                <span className="text-slate-300 font-medium">{formatPrice(openingFloat_)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Cash sales</span>
                <span className="text-slate-300 font-medium">{formatPrice(cashSales)}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-slate-700/50 pt-2">
                <span className="text-slate-400 font-semibold">Expected in drawer</span>
                <span className="text-white font-bold">{formatPrice(expectedCash)}</span>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Counted cash amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-medium">RWF</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={closingFloat}
                    onChange={(e) => { setClosingFloat(e.target.value); setError(''); }}
                    placeholder="0"
                    className="w-full pl-12 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-amber-500/70 transition-all placeholder-slate-600"
                    autoFocus
                  />
                </div>
              </div>

              {closingFloat && (
                <div className={`flex items-center justify-between text-xs rounded-xl px-3 py-2 ${
                  variance === 0
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : variance > 0
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}>
                  <span className={variance === 0 ? 'text-emerald-400' : variance > 0 ? 'text-blue-400' : 'text-red-400'}>
                    {variance === 0 ? 'Balanced' : variance > 0 ? 'Overage' : 'Shortage'}
                  </span>
                  <span className={`font-bold ${variance === 0 ? 'text-emerald-400' : variance > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {variance > 0 ? '+' : ''}{formatPrice(variance)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Shift notes (optional)…"
            rows={2}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 resize-none transition-colors"
          />

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
              <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleClose}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <><RefreshCwIcon className="w-4 h-4 animate-spin" /> Closing shift…</>
            ) : (
              <><CheckCircleIcon className="w-4 h-4" /> Confirm & Close Shift</>
            )}
          </button>

          <button
            type="button"
            onClick={() => printShiftSummary({
              cashierName,
              restaurantName,
              openedAt: currentShift?.openedAt ?? new Date().toISOString(),
              shiftHours,
              shiftMins,
              salesCount: shiftSales.count,
              totalRevenue: shiftSales.total,
              openingFloat: openingFloat_,
              closingFloat: counted,
              expectedCash,
              cashVariance: variance,
              paymentBreakdown,
              notes,
            })}
            className="w-full py-2.5 rounded-2xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <PrinterIcon className="w-4 h-4" /> Print Shift Summary
          </button>
        </div>
      </div>
    </div>
  );
}
