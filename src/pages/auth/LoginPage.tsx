import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LockIcon, UserIcon, ArrowLeftIcon, EyeIcon, EyeOffIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import { Staff } from '../../types';
import { loginStaff } from '../../api/auth';
import { Button } from '../../components/ui/Button';
import { OfflinePinScreen } from '../../components/auth/OfflinePinScreen';
import { savePasswordHash, saveUsername, hasAnyCachedProfile } from '../../utils/offlineAuth';

interface LoginPageProps {
  onLogin: (user: Staff) => void;
  onBack: () => void;
  embedded?: boolean;
}
export function LoginPage({ onLogin, onBack, embedded = false }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Start as 'offline' immediately if the browser has no network interface at all,
  // otherwise 'checking' until the real connectivity probe resolves.
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>(
    () => (navigator.onLine ? 'checking' : 'offline')
  );
  const [forceOnlineLogin, setForceOnlineLogin] = useState(false);

  const isMultiAccountConflict =
    error.toLowerCase().includes('multiple accounts found') ||
    error.toLowerCase().includes('provide restaurantid');

  // Connectivity probe — uses cache:'no-store' to bypass the service worker cache
  // so it reflects actual internet access, not a cached response.
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? '';
        const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? '';
        await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: { apikey: supabaseKey },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        // Any HTTP response (even 4xx) means the server is reachable = online.
        // Only a thrown error (network failure, timeout) means truly offline.
        setServerStatus('online');
      } catch {
        setServerStatus('offline');
      }
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 15000);

    const onOnline  = () => checkServerStatus();
    const onOffline = () => setServerStatus('offline');
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Show offline login when server is confirmed unreachable, the user hasn't
  // explicitly requested an online-login attempt, and at least one profile with a
  // cached password exists. Without the last guard, a fresh device with no network
  // would immediately show OfflinePinScreen with no way to proceed.
  const showOfflineLogin = !forceOnlineLogin && serverStatus === 'offline' && hasAnyCachedProfile();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const user = await loginStaff(username, password);
      // onLogin first so saveOfflineProfile (called inside onLogin in App.tsx)
      // creates the profile entry before savePasswordHash looks for it.
      onLogin(user);
      void savePasswordHash(user.id, password);
      saveUsername(user.id, username);
    } catch (err) {
      // TypeError from fetch = network failure — treat as offline immediately
      // rather than waiting for the 5-second probe to time out.
      if (err instanceof TypeError) {
        setServerStatus('offline');
        if (!hasAnyCachedProfile()) {
          setError('No internet connection. Sign in online at least once to enable offline access.');
        }
        // If cached profiles exist, showOfflineLogin becomes true on re-render.
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Offline login screen — shown whenever the server is unreachable.
  if (showOfflineLogin) {
    const offlineContent = (
      <OfflinePinScreen
        onSuccess={onLogin}
        onUseOnlineLogin={() => setForceOnlineLogin(true)}
      />
    );
    if (embedded) return offlineContent;
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <button
          onClick={onBack}
          className="absolute top-4 left-4 md:top-6 md:left-6 z-50 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
          aria-label="Back">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        {offlineContent}
      </div>
    );
  }

  const form = (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            Staff Login
          </h1>
          <p className="text-slate-400 mb-3">
            Enter your credentials to access the portal
          </p>
          <div className="flex items-center justify-center gap-2 text-sm">
            {serverStatus === 'online' ? (
              <>
                <WifiIcon className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Server Online</span>
              </>
            ) : serverStatus === 'offline' ? (
              <>
                <WifiOffIcon className="w-4 h-4 text-red-400" />
                <span className="text-red-400">Server Offline</span>
              </>
            ) : (
              <>
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-amber-400">Checking Connection...</span>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <UserIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="Enter username"
                required />

            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <LockIcon className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="Enter password"
                required />

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error &&
          <motion.p
            initial={{
              opacity: 0
            }}
            animate={{
              opacity: 1
            }}
            className="text-red-400 text-sm text-center">

              {error}
            </motion.p>
          }

          {isMultiAccountConflict && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              This username exists in multiple restaurants. Open the restaurant-specific login link (or ask your manager for the correct restaurant ID) and try again.
            </motion.div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            className="mt-6">

            Sign In
          </Button>

          <p className="text-xs text-slate-300 text-center mt-3">
            Need an account? Ask your manager to create your login credentials.
          </p>
        </form>
      </motion.div>
  );

  if (embedded) return form;

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <button
        onClick={onBack}
        className="absolute top-4 left-4 md:top-6 md:left-6 z-50 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
        aria-label="Back">
        <ArrowLeftIcon className="w-5 h-5" />
      </button>
      {form}
    </div>
  );
}
