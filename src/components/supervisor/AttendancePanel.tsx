import { useState, useEffect, useCallback } from 'react';
import { RefreshCwIcon, LogInIcon, LogOutIcon, UserIcon, ClockIcon } from 'lucide-react';
import { getSchedules, confirmArrival, confirmDeparture } from '../../api/schedules';
import { StaffSchedule } from '../../types';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtTime(t: string | undefined): string {
  if (!t || typeof t !== 'string') return '—';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '—';
  const p = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
}

const ROLE_COLORS: Record<string, string> = {
  waiter:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  supervisor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  manager:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  kitchen:    'bg-orange-500/15 text-orange-300 border-orange-500/30',
  cashier:    'bg-teal-500/15 text-teal-300 border-teal-500/30',
};

interface AttendancePanelProps {
  restaurantId?: string;
}

export function AttendancePanel({ restaurantId }: AttendancePanelProps) {
  const [shifts, setShifts] = useState<StaffSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const today = toDateStr(new Date());

  const load = useCallback(async () => {
    if (!restaurantId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getSchedules(restaurantId, today, today);
      setShifts(data.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, today]);

  useEffect(() => { void load(); }, [load]);

  const handleMarkArrival = async (shift: StaffSchedule) => {
    setMarkingId(shift.id);
    try {
      const time = new Date().toTimeString().slice(0, 5);
      await confirmArrival(shift.id, time);
      setShifts((prev) => prev.map((s) => s.id === shift.id ? { ...s, arrivedAt: time } : s));
    } catch { alert('Failed to mark arrival. Ensure the arrived_at column exists in staff_schedules.'); }
    finally { setMarkingId(null); }
  };

  const handleMarkDeparture = async (shift: StaffSchedule) => {
    setMarkingId(shift.id);
    try {
      const time = new Date().toTimeString().slice(0, 5);
      await confirmDeparture(shift.id, time);
      setShifts((prev) => prev.map((s) => s.id === shift.id ? { ...s, departedAt: time } : s));
    } catch { alert('Failed to mark departure. Ensure the departed_at column exists in staff_schedules.'); }
    finally { setMarkingId(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" />
        Loading today's shifts…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Staff Attendance</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-700"
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Summary row */}
      {shifts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Scheduled', value: shifts.length, color: 'text-slate-100' },
            { label: 'Checked In', value: shifts.filter((s) => s.arrivedAt).length, color: 'text-emerald-400' },
            { label: 'Departed', value: shifts.filter((s) => s.departedAt).length, color: 'text-sky-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Shift list */}
      {shifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 bg-slate-800/40 rounded-xl border border-slate-700">
          <ClockIcon className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No shifts scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => {
            const busy = markingId === shift.id;
            const roleColor = ROLE_COLORS[shift.staffRole ?? ''] ?? 'bg-slate-700/50 text-slate-300 border-slate-600';
            const attended = Boolean(shift.arrivedAt);
            const departed = Boolean(shift.departedAt);

            return (
              <div
                key={shift.id}
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Staff info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border ${roleColor}`}>
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-100 truncate">{shift.staffName || 'Staff'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${roleColor}`}>
                          {shift.staffRole ?? 'staff'}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    {departed ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-medium">Departed</span>
                    ) : attended ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">Present</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-400 border border-slate-600 font-medium">Awaited</span>
                    )}
                  </div>
                </div>

                {/* Attendance row */}
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-3">
                  {/* Arrival */}
                  <div className="flex items-center gap-2 flex-1">
                    <LogInIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    {attended ? (
                      <span className="text-sm text-emerald-400 font-semibold">{fmtTime(shift.arrivedAt)}</span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => handleMarkArrival(shift)}
                        className="text-sm px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 font-medium transition-colors"
                      >
                        {busy ? 'Saving…' : 'Mark In'}
                      </button>
                    )}
                  </div>

                  {/* Departure */}
                  <div className="flex items-center gap-2 flex-1">
                    <LogOutIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    {departed ? (
                      <span className="text-sm text-sky-400 font-semibold">{fmtTime(shift.departedAt)}</span>
                    ) : attended ? (
                      <button
                        disabled={busy}
                        onClick={() => handleMarkDeparture(shift)}
                        className="text-sm px-3 py-1 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50 font-medium transition-colors"
                      >
                        {busy ? 'Saving…' : 'Mark Out'}
                      </button>
                    ) : (
                      <span className="text-sm text-slate-600">—</span>
                    )}
                  </div>

                  {shift.notes && (
                    <p className="text-xs text-slate-500 italic truncate max-w-[120px]">{shift.notes}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
