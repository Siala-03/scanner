import React, { useEffect, useState, useMemo } from 'react';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon, XIcon } from 'lucide-react';
import { StaffSchedule } from '../../types';
import { Staff } from '../../types';
import { getSchedules, createSchedule, deleteSchedule } from '../../api/schedules';
import { fetchStaff } from '../../api/staff';

function restaurantId() { return localStorage.getItem('restaurantId') || ''; }

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
}

const STAFF_COLORS = [
  'bg-blue-500/20 border-blue-500/40 text-blue-300',
  'bg-green-500/20 border-green-500/40 text-green-300',
  'bg-purple-500/20 border-purple-500/40 text-purple-300',
  'bg-rose-500/20 border-rose-500/40 text-rose-300',
  'bg-amber-500/20 border-amber-500/40 text-amber-300',
  'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
  'bg-orange-500/20 border-orange-500/40 text-orange-300',
  'bg-teal-500/20 border-teal-500/40 text-teal-300',
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function emptyForm(date: string) {
  return { staffId: '', shiftDate: date, startTime: '09:00', endTime: '17:00', notes: '' };
}

export function SchedulingPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm(toDateStr(new Date())));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const weekEnd = addDays(weekStart, 6);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Color index per staff member (stable across renders)
  const staffColorMap = useMemo(() => {
    const map = new Map<string, string>();
    staff.forEach((s, i) => map.set(s.id, STAFF_COLORS[i % STAFF_COLORS.length]));
    return map;
  }, [staff]);

  async function load() {
    setLoading(true);
    try {
      const [data, staffData] = await Promise.all([
        getSchedules(restaurantId(), toDateStr(weekStart), toDateStr(weekEnd)),
        fetchStaff(),
      ]);
      setSchedules(data);
      setStaff(staffData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [weekStart]);

  async function handleCreate() {
    if (!form.staffId) { setFormError('Please select a staff member'); return; }
    setSaving(true); setFormError('');
    try {
      const created = await createSchedule({
        restaurantId: restaurantId(),
        staffId: form.staffId,
        shiftDate: form.shiftDate,
        startTime: form.startTime,
        endTime: form.endTime,
        notes: form.notes || undefined,
      });
      setSchedules((prev) => [...prev, created].sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || a.startTime.localeCompare(b.startTime)));
      setShowModal(false);
    } catch (e: any) {
      setFormError(e?.message || 'Failed to create shift');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this shift?')) return;
    try {
      await deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch { alert('Failed to delete shift'); }
  }

  const fmtWeekRange = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl">
            <CalendarDaysIcon className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Staff Schedule</h1>
            <p className="text-xs text-slate-400">{fmtWeekRange}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(getWeekStart(new Date()))} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">Today</button>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"><ChevronLeftIcon className="w-4 h-4" /></button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"><ChevronRightIcon className="w-4 h-4" /></button>
          <button
            onClick={() => { setForm(emptyForm(toDateStr(new Date()))); setFormError(''); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
          >
            <PlusIcon className="w-4 h-4" /> Add Shift
          </button>
        </div>
      </div>

      {/* Staff legend */}
      {staff.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {staff.map((s) => (
            <span key={s.id} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${staffColorMap.get(s.id) || ''}`}>
              {s.name}
            </span>
          ))}
        </div>
      )}

      {loading && <div className="text-slate-400 text-sm py-10 text-center">Loading...</div>}

      {!loading && (
        <>
          {/* Desktop: 7-column grid */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {weekDays.map((day, i) => {
              const dateStr = toDateStr(day);
              const isToday = dateStr === toDateStr(new Date());
              const dayShifts = schedules.filter((s) => s.shiftDate === dateStr);
              return (
                <div key={dateStr} className={`rounded-xl border p-2 min-h-[160px] ${isToday ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 bg-slate-800'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-amber-400' : 'text-slate-400'}`}>{DAY_LABELS[i]}</p>
                      <p className={`text-sm font-bold ${isToday ? 'text-amber-300' : 'text-slate-200'}`}>{day.getDate()}</p>
                    </div>
                    <button
                      onClick={() => { setForm(emptyForm(dateStr)); setFormError(''); setShowModal(true); }}
                      className="p-1 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className={`group flex items-start justify-between gap-1 text-xs px-2 py-1.5 rounded-lg border ${staffColorMap.get(shift.staffId) || 'bg-slate-700 border-slate-600 text-slate-300'}`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{shift.staffName || 'Staff'}</p>
                          <p className="opacity-70">{fmtTime(shift.startTime)}–{fmtTime(shift.endTime)}</p>
                        </div>
                        <button onClick={() => handleDelete(shift.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-opacity flex-shrink-0">
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {dayShifts.length === 0 && <p className="text-xs text-slate-600 text-center py-2">—</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: vertical list */}
          <div className="md:hidden space-y-3">
            {weekDays.map((day, i) => {
              const dateStr = toDateStr(day);
              const isToday = dateStr === toDateStr(new Date());
              const dayShifts = schedules.filter((s) => s.shiftDate === dateStr);
              return (
                <div key={dateStr} className={`rounded-xl border p-4 ${isToday ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 bg-slate-800'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className={`text-sm font-bold ${isToday ? 'text-amber-300' : 'text-slate-200'}`}>{DAY_LABELS[i]}, {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      {isToday && <span className="ml-2 text-xs text-amber-400 font-medium">Today</span>}
                    </div>
                    <button
                      onClick={() => { setForm(emptyForm(dateStr)); setFormError(''); setShowModal(true); }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    >
                      <PlusIcon className="w-3 h-3" /> Add
                    </button>
                  </div>
                  {dayShifts.length === 0 ? (
                    <p className="text-xs text-slate-600">No shifts scheduled</p>
                  ) : (
                    <div className="space-y-2">
                      {dayShifts.map((shift) => (
                        <div key={shift.id} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg border ${staffColorMap.get(shift.staffId) || 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                          <div>
                            <span className="font-semibold">{shift.staffName || 'Staff'}</span>
                            <span className="ml-2 opacity-70 text-xs">{fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}</span>
                            {shift.notes && <p className="text-xs opacity-60 mt-0.5 italic">{shift.notes}</p>}
                          </div>
                          <button onClick={() => handleDelete(shift.id)} className="p-1.5 hover:text-red-400 transition-colors">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Shift Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100 mb-5">Add Shift</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Staff Member *</label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.staffId}
                  onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
                >
                  <option value="">Select staff member...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.shiftDate}
                  onChange={(e) => setForm((f) => ({ ...f, shiftDate: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Start Time</label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">End Time</label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Opening shift"
                />
              </div>
              {formError && <p className="text-sm text-red-400 bg-red-900/20 border border-red-700 rounded-lg px-3 py-2">{formError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Add Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
