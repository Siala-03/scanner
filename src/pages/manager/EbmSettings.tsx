import { useEffect, useState, useCallback } from 'react';
import {
  SaveIcon, RefreshCwIcon, CheckCircle2Icon, XCircleIcon,
  AlertTriangleIcon, ServerIcon, FileTextIcon, ChevronDownIcon, ChevronUpIcon,
} from 'lucide-react';
import {
  getEbmConfig, saveEbmConfig, initializeEbmDevice,
  getEbmInvoices,
  type EbmConfig, type EbmConfigInput, type EbmInvoice,
} from '../../api/ebm';
import { formatPrice } from '../../utils/currency';

interface EbmSettingsProps {
  restaurantId: string;
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  '01': 'Cash', '02': 'Credit/Card', '03': 'Cheque', '04': 'Mobile Money', '05': 'Other',
};

function StatusBadge({ status }: { status: EbmInvoice['status'] }) {
  const styles = {
    success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    failed:  'bg-red-500/20 text-red-400 border-red-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  );
}

export function EbmSettings({ restaurantId }: EbmSettingsProps) {
  const [config, setConfig] = useState<EbmConfig | null>(null);
  const [form, setForm] = useState<EbmConfigInput>({
    restaurantId,
    tpin: '',
    bhfId: '000',
    dvcSrlNo: '',
    baseUrl: 'http://localhost:8088',
    env: 'sandbox',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<'saved' | 'error' | null>(null);
  const [initResult, setInitResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [invoices, setInvoices] = useState<EbmInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceOffset, setInvoiceOffset] = useState(0);
  const [invoiceFilter, setInvoiceFilter] = useState<string>('');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEbmConfig(restaurantId);
      if (data) {
        setConfig(data);
        setForm({
          restaurantId,
          tpin: data.tpin,
          bhfId: data.bhf_id,
          dvcSrlNo: data.dvc_srl_no,
          baseUrl: data.base_url,
          env: data.env,
        });
      }
    } catch { /* no config yet */ }
    finally { setLoading(false); }
  }, [restaurantId]);

  const loadInvoices = useCallback(async (offset = 0, status = '') => {
    setInvoicesLoading(true);
    try {
      const data = await getEbmInvoices(restaurantId, {
        limit: 20,
        offset,
        status: status || undefined,
      });
      setInvoices(data);
    } catch { setInvoices([]); }
    finally { setInvoicesLoading(false); }
  }, [restaurantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadInvoices(invoiceOffset, invoiceFilter); }, [loadInvoices, invoiceOffset, invoiceFilter]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await saveEbmConfig(form);
      setConfig(saved);
      setSaveMsg('saved');
    } catch { setSaveMsg('error'); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 3000); }
  };

  const handleInitialize = async () => {
    if (!config) return;
    setInitializing(true);
    setInitResult(null);
    try {
      const result = await initializeEbmDevice(restaurantId);
      if (result.resultCd === '000') {
        setInitResult({ ok: true, msg: result.resultMsg || 'Device initialized successfully' });
        loadConfig();
      } else {
        setInitResult({ ok: false, msg: `${result.resultCd}: ${result.resultMsg}` });
      }
    } catch (err) {
      setInitResult({ ok: false, msg: err instanceof Error ? err.message : 'Initialization failed' });
    } finally { setInitializing(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading EBM configuration…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Device Configuration ── */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-5">
          <ServerIcon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-slate-100">EBM / VSDC Device Configuration</h2>
          {config?.initialized_at && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2Icon className="w-3.5 h-3.5" /> Initialized
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">TPIN <span className="text-red-400">*</span></label>
            <input
              value={form.tpin}
              onChange={(e) => setForm({ ...form, tpin: e.target.value })}
              placeholder="e.g. 999900929"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Branch ID (BHF ID) <span className="text-red-400">*</span></label>
            <input
              value={form.bhfId}
              onChange={(e) => setForm({ ...form, bhfId: e.target.value })}
              placeholder="e.g. 000"
              maxLength={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Device Serial No. <span className="text-red-400">*</span></label>
            <input
              value={form.dvcSrlNo}
              onChange={(e) => setForm({ ...form, dvcSrlNo: e.target.value })}
              placeholder="e.g. SERV2024001"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Environment</label>
            <select
              value={form.env}
              onChange={(e) => setForm({ ...form, env: e.target.value as 'sandbox' | 'production' })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="sandbox">Sandbox (testing)</option>
              <option value="production">Production (live)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">VSDC Base URL</label>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="http://localhost:8088"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Sandbox: <code className="text-slate-400">http://localhost:8088</code> &nbsp;·&nbsp;
              Production: <code className="text-slate-400">https://ebm.rra.gov.rw</code>
            </p>
          </div>
        </div>

        {/* Save + Initialize row */}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving || !form.tpin || !form.bhfId || !form.dvcSrlNo}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>

          {config && (
            <button
              onClick={handleInitialize}
              disabled={initializing}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCwIcon className={`w-4 h-4 ${initializing ? 'animate-spin' : ''}`} />
              {initializing ? 'Initializing…' : 'Initialize Device'}
            </button>
          )}

          {saveMsg === 'saved' && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle2Icon className="w-4 h-4" /> Saved
            </span>
          )}
          {saveMsg === 'error' && (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <XCircleIcon className="w-4 h-4" /> Failed to save
            </span>
          )}
        </div>

        {/* Init result banner */}
        {initResult && (
          <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
            initResult.ok
              ? 'bg-emerald-900/40 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-900/40 border border-red-500/30 text-red-300'
          }`}>
            {initResult.ok
              ? <CheckCircle2Icon className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />}
            {initResult.msg}
          </div>
        )}

        {/* Status row */}
        {config && (
          <div className="mt-5 pt-4 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-400">
            <div>
              <span className="block text-slate-500 mb-0.5">Status</span>
              <span className={config.is_active ? 'text-emerald-400' : 'text-red-400'}>
                {config.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div>
              <span className="block text-slate-500 mb-0.5">Environment</span>
              <span className={config.env === 'production' ? 'text-emerald-400' : 'text-amber-400'}>
                {config.env}
              </span>
            </div>
            <div>
              <span className="block text-slate-500 mb-0.5">Initialized</span>
              <span className="text-slate-300">
                {config.initialized_at
                  ? new Date(config.initialized_at).toLocaleDateString()
                  : '—'}
              </span>
            </div>
            <div>
              <span className="block text-slate-500 mb-0.5">Last Request</span>
              <span className="text-slate-300">{config.last_req_dt || '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Fiscal Invoice History ── */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FileTextIcon className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-slate-100">Fiscal Invoice History</h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={invoiceFilter}
              onChange={(e) => { setInvoiceFilter(e.target.value); setInvoiceOffset(0); }}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <button
              onClick={() => loadInvoices(invoiceOffset, invoiceFilter)}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              title="Refresh"
            >
              <RefreshCwIcon className={`w-4 h-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {invoicesLoading ? (
          <div className="text-center py-10 text-slate-500 text-sm">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">No fiscal invoices found.</div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="bg-slate-750 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/50 transition-colors"
                >
                  <StatusBadge status={inv.status} />
                  <span className="text-xs font-mono text-slate-300 min-w-0 truncate">{inv.cis_invc_no}</span>
                  <span className="text-xs text-slate-500 uppercase">{inv.invoice_type === 'S' ? 'Sale' : inv.invoice_type === 'R' ? 'Refund' : 'Training'}</span>
                  <span className="ml-auto text-sm font-semibold text-slate-200">{formatPrice(inv.tot_amt)}</span>
                  <span className="text-xs text-slate-500 shrink-0">{new Date(inv.created_at).toLocaleDateString()}</span>
                  {expandedInvoice === inv.id
                    ? <ChevronUpIcon className="w-4 h-4 text-slate-500 shrink-0" />
                    : <ChevronDownIcon className="w-4 h-4 text-slate-500 shrink-0" />}
                </button>

                {expandedInvoice === inv.id && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      ['Invoice No.', inv.cis_invc_no],
                      ['Type', inv.invoice_type === 'S' ? 'Sale' : inv.invoice_type === 'R' ? 'Refund' : 'Training'],
                      ['Payment', PAYMENT_TYPE_LABELS[inv.pmt_ty_cd ?? ''] ?? inv.pmt_ty_cd ?? '—'],
                      ['Total', formatPrice(inv.tot_amt)],
                      ['Taxable Amt', inv.tot_taxbl_amt != null ? formatPrice(inv.tot_taxbl_amt) : '—'],
                      ['Tax (18%)', inv.tot_tax_amt != null ? formatPrice(inv.tot_tax_amt) : '—'],
                      ['Receipt No.', inv.rcpt_no ?? '—'],
                      ['SDC ID', inv.sdc_id ?? '—'],
                      ['Fiscalized', inv.fiscalized_at ? new Date(inv.fiscalized_at).toLocaleString() : '—'],
                    ].map(([label, val]) => (
                      <div key={label as string}>
                        <span className="block text-slate-500 mb-0.5">{label}</span>
                        <span className="text-slate-300 font-mono break-all">{String(val)}</span>
                      </div>
                    ))}
                    {inv.rcpt_sign && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="block text-slate-500 mb-0.5">Receipt Signature</span>
                        <span className="text-slate-400 font-mono text-xs break-all">{inv.rcpt_sign}</span>
                      </div>
                    )}
                    {inv.error_msg && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="block text-red-400 mb-0.5">Error</span>
                        <span className="text-red-300">{inv.error_msg}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
          <button
            onClick={() => setInvoiceOffset(Math.max(0, invoiceOffset - 20))}
            disabled={invoiceOffset === 0}
            className="px-3 py-1.5 bg-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-600 transition-colors"
          >
            ← Previous
          </button>
          <span>Page {Math.floor(invoiceOffset / 20) + 1}</span>
          <button
            onClick={() => setInvoiceOffset(invoiceOffset + 20)}
            disabled={invoices.length < 20}
            className="px-3 py-1.5 bg-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-600 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
