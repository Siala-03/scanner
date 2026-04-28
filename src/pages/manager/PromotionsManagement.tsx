import React, { useEffect, useState } from 'react';
import { PlusIcon, EditIcon, TrashIcon, ToggleLeftIcon, ToggleRightIcon, TagIcon } from 'lucide-react';
import { Promotion } from '../../types';
import { getPromotions, createPromotion, updatePromotion, deletePromotion } from '../../api/promotions';
import { formatPrice } from '../../utils/currency';

function restaurantId(): string {
  return localStorage.getItem('restaurantId') || '';
}

function emptyForm(): Partial<Promotion> {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return {
    name: '',
    code: '',
    type: 'percentage',
    discountValue: 10,
    minOrderAmount: 0,
    validFrom: today,
    validUntil: nextMonth,
    isActive: true,
  };
}

export function PromotionsManagement() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Promotion>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setLoading(true);
      const data = await getPromotions(restaurantId());
      setPromotions(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load promotions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setError('');
    setShowModal(true);
  }

  function openEdit(p: Promotion) {
    setForm({
      name: p.name,
      code: p.code,
      type: p.type,
      discountValue: p.discountValue,
      minOrderAmount: p.minOrderAmount,
      maxUses: p.maxUses,
      validFrom: p.validFrom?.slice(0, 10),
      validUntil: p.validUntil?.slice(0, 10),
      isActive: p.isActive,
    });
    setEditingId(p.id);
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name?.trim() || !form.code?.trim()) {
      setError('Name and code are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const updated = await updatePromotion(editingId, form);
        setPromotions(prev => prev.map(p => p.id === editingId ? updated : p));
      } else {
        const created = await createPromotion({ ...form, restaurantId: restaurantId() });
        setPromotions(prev => [created, ...prev]);
      }
      setShowModal(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save promotion');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(p: Promotion) {
    try {
      const updated = await updatePromotion(p.id, { isActive: !p.isActive });
      setPromotions(prev => prev.map(x => x.id === p.id ? updated : x));
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    }
  }

  async function handleDelete(p: Promotion) {
    if (!confirm(`Delete promotion "${p.name}"?`)) return;
    try {
      await deletePromotion(p.id);
      setPromotions(prev => prev.filter(x => x.id !== p.id));
    } catch (e: any) {
      alert(e?.message || 'Failed to delete');
    }
  }

  function formatDiscount(p: Promotion) {
    return p.type === 'percentage' ? `${p.discountValue}% off` : `${formatPrice(p.discountValue)} off`;
  }

  function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const statusColor = (p: Promotion) => {
    if (!p.isActive) return 'bg-slate-700 text-slate-400';
    const now = new Date();
    if (new Date(p.validUntil) < now) return 'bg-red-900/40 text-red-400';
    if (new Date(p.validFrom) > now) return 'bg-blue-900/40 text-blue-400';
    return 'bg-green-900/40 text-green-400';
  };

  const statusLabel = (p: Promotion) => {
    if (!p.isActive) return 'Inactive';
    const now = new Date();
    if (new Date(p.validUntil) < now) return 'Expired';
    if (new Date(p.validFrom) > now) return 'Scheduled';
    return 'Active';
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl">
            <TagIcon className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Promotions</h1>
            <p className="text-xs text-slate-400">Create promo codes customers enter at checkout</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          New Promotion
        </button>
      </div>

      {loading && <div className="text-slate-400 text-sm">Loading...</div>}

      {!loading && promotions.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <TagIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-400">No promotions yet</p>
          <p className="text-sm">Create your first promo code to drive sales.</p>
        </div>
      )}

      {!loading && promotions.length > 0 && (
        <div className="space-y-3">
          {promotions.map(p => (
            <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-amber-400 font-mono tracking-wider">{p.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(p)}`}>{statusLabel(p)}</span>
                </div>
                <p className="text-slate-200 text-sm font-medium">{p.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {formatDiscount(p)} · Min order: {formatPrice(p.minOrderAmount)}
                  {p.maxUses != null ? ` · ${p.usesCount}/${p.maxUses} uses` : ` · ${p.usesCount} uses`}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {formatDate(p.validFrom)} → {formatDate(p.validUntil)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleToggle(p)}
                  title={p.isActive ? 'Deactivate' : 'Activate'}
                  className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  {p.isActive
                    ? <ToggleRightIcon className="w-5 h-5 text-green-400" />
                    : <ToggleLeftIcon className="w-5 h-5 text-slate-500" />}
                </button>
                <button
                  onClick={() => openEdit(p)}
                  className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-amber-400"
                >
                  <EditIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="p-2 rounded-lg hover:bg-red-900/30 transition-colors text-slate-400 hover:text-red-400"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100 mb-5">{editingId ? 'Edit Promotion' : 'New Promotion'}</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Promotion Name</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.name || ''}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Launch Special"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Promo Code</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.code || ''}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="LAUNCH20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.type || 'percentage'}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (RWF)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Discount {form.type === 'percentage' ? '(%)' : '(RWF)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={form.type === 'percentage' ? 1 : 100}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.discountValue || 0}
                    onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Min Order (RWF)</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.minOrderAmount || 0}
                    onChange={e => setForm(f => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Max Uses (blank = unlimited)</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.maxUses || ''}
                    onChange={e => setForm(f => ({ ...f, maxUses: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valid From</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.validFrom || ''}
                    onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valid Until</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.validUntil || ''}
                    onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive !== false}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-300">Active (customers can use this code)</span>
              </label>

              {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-700 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
