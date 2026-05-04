import React, { useEffect, useState } from 'react';
import { CalendarIcon, PlusIcon, CheckIcon, UserIcon, PhoneIcon, UsersIcon, ClockIcon } from 'lucide-react';
import { Reservation, ReservationStatus } from '../../types';
import { getReservations, createReservation, updateReservation, cancelReservation } from '../../api/reservations';

function restaurantId(): string {
  return localStorage.getItem('restaurantId') || '';
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateOnly(value: string | undefined): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function emptyForm() {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    partySize: 2,
    reservationDate: today(),
    reservationTime: '19:00',
    durationMinutes: 90,
    tableNumber: '',
    notes: '',
  };
}

const STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700' },
  confirmed: { label: 'Confirmed', color: 'text-blue-400',   bg: 'bg-blue-900/30 border-blue-700' },
  seated:    { label: 'Seated',    color: 'text-green-400',  bg: 'bg-green-900/30 border-green-700' },
  completed: { label: 'Completed', color: 'text-slate-400',  bg: 'bg-slate-700 border-slate-600' },
  cancelled: { label: 'Cancelled', color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800' },
  no_show:   { label: 'No Show',   color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-800' },
};

export function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load(date: string) {
    setLoading(true);
    try {
      const data = await getReservations(restaurantId(), date);
      // Normalize reservation_date from Postgres (may come as full ISO timestamp)
      // Also coerce reservationTime to a plain HH:MM string in case Postgres returns an object
      setReservations(data.map(r => ({
        ...r,
        reservationDate: dateOnly(r.reservationDate),
        reservationTime: r.reservationTime ? String(r.reservationTime).slice(0, 5) : '',
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(selectedDate); }, [selectedDate]);

  async function handleStatusChange(r: Reservation, status: ReservationStatus) {
    try {
      const updated = await updateReservation(r.id, { status });
      setReservations(prev => prev.map(x => x.id === r.id ? updated : x));
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    }
  }

  async function handleCancel(r: Reservation) {
    if (!confirm(`Cancel reservation for ${r.customerName}?`)) return;
    try {
      await cancelReservation(r.id);
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'cancelled' } : x));
    } catch (e: any) {
      alert(e?.message || 'Failed to cancel');
    }
  }

  async function handleCreate() {
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setFormError('Name and phone are required');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createReservation({
        restaurantId: restaurantId(),
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || undefined,
        partySize: Number(form.partySize),
        reservationDate: form.reservationDate,
        reservationTime: form.reservationTime,
        durationMinutes: Number(form.durationMinutes),
        tableNumber: form.tableNumber ? Number(form.tableNumber) : undefined,
        notes: form.notes.trim() || undefined,
      });
      // Navigate to the reservation's date and reload so the entry is always visible
      const targetDate = form.reservationDate;
      setShowModal(false);
      setForm(emptyForm());
      setSelectedDate(targetDate);
      await load(targetDate);
    } catch (e: any) {
      setFormError(e?.message || 'Failed to create reservation');
    } finally {
      setSaving(false);
    }
  }

  function formatTime(time: string | undefined) {
    if (!time) return '—';
    const [h, m] = time.slice(0, 5).split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
  }

  const activeCount = reservations.filter(r => !['cancelled', 'no_show', 'completed'].includes(r.status)).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl">
            <CalendarIcon className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Reservations</h1>
            <p className="text-xs text-slate-400">{activeCount} active for selected day</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={() => { setForm(emptyForm()); setFormError(''); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* List */}
      {loading && <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>}

      {!loading && reservations.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <CalendarIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-400">No reservations for this day</p>
          <p className="text-sm">Add one with the button above.</p>
        </div>
      )}

      <div className="space-y-3">
        {reservations.map(r => {
          const cfg = STATUS_CONFIG[r.status];
          return (
            <div key={r.id} className={`rounded-xl border p-4 ${cfg.bg}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-slate-100">{r.customerName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    {r.tableNumber && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Table {r.tableNumber}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><ClockIcon className="w-3 h-3" />{formatTime(r.reservationTime)} · {r.durationMinutes}min</span>
                    <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{r.partySize} guests</span>
                    <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3" />{r.customerPhone}</span>
                  </div>
                  {r.notes && <p className="text-xs text-slate-500 mt-1 italic">"{r.notes}"</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {r.status === 'pending' && (
                    <button
                      onClick={() => handleStatusChange(r, 'confirmed')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                    >
                      Confirm
                    </button>
                  )}
                  {r.status === 'confirmed' && (
                    <button
                      onClick={() => handleStatusChange(r, 'seated')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors flex items-center gap-1"
                    >
                      <CheckIcon className="w-3 h-3" /> Seat
                    </button>
                  )}
                  {r.status === 'seated' && (
                    <button
                      onClick={() => handleStatusChange(r, 'completed')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-medium transition-colors"
                    >
                      Complete
                    </button>
                  )}
                  {['pending', 'confirmed'].includes(r.status) && (
                    <button
                      onClick={() => handleStatusChange(r, 'no_show')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-orange-800/50 hover:bg-orange-800 text-orange-300 font-medium transition-colors"
                    >
                      No Show
                    </button>
                  )}
                  {!['cancelled', 'completed'].includes(r.status) && (
                    <button
                      onClick={() => handleCancel(r)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-400 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-100 mb-5">New Reservation</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Customer Name *</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.customerName}
                    onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Phone *</label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.customerPhone}
                    onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                    placeholder="+250 7XX XXX XXX"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.customerEmail}
                  onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
                  placeholder="optional"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Date</label>
                  <input
                    type="date"
                    className="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.reservationDate}
                    onChange={e => setForm(f => ({ ...f, reservationDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Time</label>
                  <input
                    type="time"
                    className="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.reservationTime}
                    onChange={e => setForm(f => ({ ...f, reservationTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Duration (min)</label>
                  <input
                    type="number"
                    min={30}
                    step={15}
                    className="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="90"
                    value={form.durationMinutes === 0 ? '' : form.durationMinutes}
                    onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Party Size</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="2"
                    value={form.partySize === 0 ? '' : form.partySize}
                    onChange={e => setForm(f => ({ ...f, partySize: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Table No. (optional)</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.tableNumber}
                    onChange={e => setForm(f => ({ ...f, tableNumber: e.target.value }))}
                    placeholder="Assign later"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Allergies, special occasions..."
                />
              </div>

              {formError && <p className="text-sm text-red-400 bg-red-900/20 border border-red-700 rounded-lg px-3 py-2">{formError}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {saving ? 'Creating...' : 'Create Reservation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
