import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LockIcon, UserIcon, ArrowLeftIcon, EyeIcon, EyeOffIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import { Staff } from '../../types';
import { loginStaff } from '../../api/auth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

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
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const isMultiAccountConflict =
    error.toLowerCase().includes('multiple accounts found') ||
    error.toLowerCase().includes('provide restaurantid');

  // Check Supabase connectivity on mount
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const { error } = await supabase.from('restaurants').select('id').limit(1);
        setServerStatus(error ? 'offline' : 'online');
      } catch {
        setServerStatus('offline');
      }
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    console.log('Login attempt:', { username });

    try {
      const user = await loginStaff(username, password);
      onLogin(user);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

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