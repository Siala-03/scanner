import { useState, useEffect, useCallback } from 'react';
import { WifiOffIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon, ShieldIcon } from 'lucide-react';
import {
  getProfileByUsername,
  verifyPassword,
  restoreSession,
  isLockedOut,
  lockoutRemainingSeconds,
  remainingAttempts,
} from '../../utils/offlineAuth';
import type { Staff } from '../../types';

interface OfflinePinScreenProps {
  onSuccess: (user: Staff) => void;
  onUseOnlineLogin: () => void;
}

export function OfflinePinScreen({ onSuccess, onUseOnlineLogin }: OfflinePinScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockedStaffId, setLockedStaffId] = useState<string | null>(null);
  const [lockSeconds, setLockSeconds] = useState(0);

  useEffect(() => {
    if (!lockedStaffId) return;
    const t = setInterval(() => {
      const remaining = lockoutRemainingSeconds(lockedStaffId);
      setLockSeconds(remaining);
      if (remaining === 0) {
        setLockedStaffId(null);
        clearInterval(t);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lockedStaffId]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password || isVerifying) return;
    setError('');
    setIsVerifying(true);

    try {
      const profile = getProfileByUsername(username);
      if (!profile) {
        setError(`No offline access for "${username}". Sign in online at least once to enable offline access.`);
        return;
      }
      if (!profile.passwordHash) {
        setError('No offline credentials cached for this account. Sign in online first.');
        return;
      }
      if (isLockedOut(profile.staffId)) {
        setLockedStaffId(profile.staffId);
        setLockSeconds(lockoutRemainingSeconds(profile.staffId));
        setError('Account temporarily locked due to too many failed attempts.');
        return;
      }

      const correct = await verifyPassword(profile.staffId, password);
      if (correct) {
        const staff = restoreSession(profile.staffId);
        if (staff) {
          onSuccess(staff);
        } else {
          setError('Session data missing. Connect to internet to log in.');
        }
      } else {
        setPassword('');
        const rem = remainingAttempts(profile.staffId);
        if (rem === 0) {
          setLockedStaffId(profile.staffId);
          setLockSeconds(lockoutRemainingSeconds(profile.staffId));
          setError('Too many failed attempts. Account locked for 5 minutes.');
        } else {
          setError(`Incorrect password. ${rem} attempt${rem !== 1 ? 's' : ''} remaining.`);
        }
      }
    } finally {
      setIsVerifying(false);
    }
  }, [username, password, isVerifying, onSuccess]);

  const locked = !!lockedStaffId;

  return (
    <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Staff Login</h1>
        <p className="text-slate-400 mb-3">Enter your credentials to access the portal</p>
        <div className="flex items-center justify-center gap-2 text-sm">
          <WifiOffIcon className="w-4 h-4 text-amber-400" />
          <span className="text-amber-300 font-medium">Working offline</span>
        </div>
      </div>

      {locked ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-center mb-6">
          <p className="text-sm font-semibold text-red-300 mb-1">Account temporarily locked</p>
          <p className="text-2xl font-bold text-red-400 tabular-nums">
            {Math.floor(lockSeconds / 60)}:{String(lockSeconds % 60).padStart(2, '0')}
          </p>
          <p className="text-xs text-red-400/70 mt-1">Too many incorrect passwords</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">Username</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <UserIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                placeholder="Enter username"
                autoFocus
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">Password</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <LockIcon className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!username.trim() || !password || isVerifying}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm transition-colors flex items-center justify-center gap-2 mt-6"
          >
            {isVerifying ? (
              <><div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" /> Signing in…</>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      )}

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 mt-5 mb-4">
        <ShieldIcon className="w-3.5 h-3.5" />
        <span>Verified locally — no internet needed</span>
      </div>

      <div className="text-center">
        <button
          onClick={onUseOnlineLogin}
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors hover:underline underline-offset-2"
        >
          Try signing in online
        </button>
      </div>
    </div>
  );
}
