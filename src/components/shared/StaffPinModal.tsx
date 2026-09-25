import { useState, useEffect, useCallback } from 'react';
import { XIcon, DeleteIcon } from 'lucide-react';
import { verifyStaffPin } from '../../utils/staffPin';

interface StaffPinModalProps {
  staffId: string;
  staffName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function StaffPinModal({ staffId, staffName, onSuccess, onCancel }: StaffPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const initials = staffName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

  const submit = useCallback(async (digits: string) => {
    if (digits.length < 4 || verifying) return;
    setVerifying(true);
    const ok = await verifyStaffPin(staffId, digits);
    setVerifying(false);
    if (ok) {
      onSuccess();
    } else {
      setShake(true);
      setError('Incorrect PIN');
      setPin('');
      setTimeout(() => setShake(false), 500);
    }
  }, [staffId, verifying, onSuccess]);

  const handleKey = useCallback((key: string) => {
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      setError('');
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    setError('');
    if (next.length === 4) submit(next);
  }, [pin, submit]);

  // Physical keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      if (e.key === 'Backspace') handleKey('del');
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey, onCancel]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`w-full max-w-xs bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-300">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{staffName}</p>
              <p className="text-xs text-slate-400">Enter your 4-digit PIN</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pin.length
                  ? 'bg-amber-400 border-amber-400 scale-110'
                  : 'bg-transparent border-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-xs text-red-400 mb-4 -mt-2">{error}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, i) => {
            if (key === '') return <div key={i} />;
            if (key === 'del') {
              return (
                <button
                  key={i}
                  onClick={() => handleKey('del')}
                  disabled={verifying}
                  className="h-14 flex items-center justify-center rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition-colors disabled:opacity-40"
                >
                  <DeleteIcon className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => handleKey(key)}
                disabled={verifying || pin.length >= 4}
                className="h-14 flex items-center justify-center rounded-2xl bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 active:bg-amber-500/30 text-white text-xl font-bold transition-colors disabled:opacity-40"
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
