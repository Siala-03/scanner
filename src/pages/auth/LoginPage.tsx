import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LockIcon, UserIcon, ArrowLeftIcon, EyeIcon, EyeOffIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import { StaffRole, Staff } from '../../types';
import { loginStaff } from '../../api/auth';
import { ApiError } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { SignUpPage } from './SignUpPage';

interface LoginPageProps {
  role: StaffRole;
  onLogin: (user: Staff) => void;
  onBack: () => void;
}
export function LoginPage({ role, onLogin, onBack }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Check server connection on mount
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await fetch('/health');
        if (response.ok) {
          setServerStatus('online');
        } else {
          setServerStatus('offline');
        }
      } catch {
        setServerStatus('offline');
      }
    };

    checkServerStatus();
    // Check every 30 seconds
    const interval = setInterval(checkServerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Render signup form if in signup mode
  if (mode === 'signup') {
    return (
      <SignUpPage
        role={role}
        onSignedUp={onLogin}
        onBack={() => setMode('login')}
      />
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    console.log('Login attempt:', { username, role });

    try {
      const user = await loginStaff(username, password);
      console.log('Login response:', user);

      // Persist staffId for authenticated requests (including manager staff creation)
      localStorage.setItem('staffId', user.id);
      localStorage.removeItem('token');

      if (user.role === role) {
        console.log('Login successful, redirecting...');
        onLogin(user);
      } else {
        const errorMsg = `This account has ${user.role} privileges, but you're trying to log in as ${role}. Please use the correct portal.`;
        console.warn('Role mismatch:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Login error:', err);
      let errorMessage = 'Login failed. Please try again.';

      if (err instanceof ApiError) {
        switch (err.status) {
          case 0:
            errorMessage = 'Cannot connect to server. Please check your internet connection and try again.';
            break;
          case 401:
            errorMessage = 'Invalid username or password. Please check your credentials.';
            break;
          case 403:
            errorMessage = 'Access denied. Please contact your administrator.';
            break;
          case 500:
            errorMessage = 'Server error. Please try again later.';
            break;
          default:
            errorMessage = err.message || 'Login failed. Please try again.';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <div className="min-h-screen bg-[#1a1410] flex items-center justify-center p-4">
      <button
        onClick={onBack}
        className="absolute top-4 left-4 md:top-6 md:left-6 z-50 p-2 rounded-full bg-[#2a2018] text-[#a89f91] hover:text-amber-500 transition-colors"
        aria-label="Back">
        <ArrowLeftIcon className="w-5 h-5" />
      </button>

      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        className="w-full max-w-md bg-[#2a2018] border border-[#3a2e20] rounded-2xl p-8 shadow-2xl">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-[#e8e4dc] mb-2">
            {roleTitle} Login
          </h1>
          <p className="text-[#a89f91] mb-3">
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
            <label className="block text-sm font-medium text-[#e8e4dc] mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89f91]">
                <UserIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1a1410] border border-[#3a2e20] text-[#e8e4dc] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="Enter username"
                required />

            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#e8e4dc] mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89f91]">
                <LockIcon className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-[#1a1410] border border-[#3a2e20] text-[#e8e4dc] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="Enter password"
                required />

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a89f91] hover:text-[#e8e4dc]"
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            className="mt-6">

            Sign In
          </Button>

          {role === 'manager' ? (
            <button
              type="button"
              onClick={() => setMode('signup')}
              className="w-full text-sm text-amber-400 mt-3 hover:text-amber-300 transition-colors"
            >
              Create a new account
            </button>
          ) : (
            <p className="text-xs text-slate-300 text-center mt-3">
              Need an account? Ask your manager to create your login credentials.
            </p>
          )}
        </form>
      </motion.div>
    </div>);

}