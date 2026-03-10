import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LockIcon, UserIcon, ArrowLeftIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { StaffRole, Staff } from '../../types';
import { validateLogin } from '../../data/staffData';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
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

  if (mode === 'signup') {
    return (
      <SignUpPage
        role={role}
        onSignedUp={onLogin}
        onBack={() => setMode('login')}
      />
    );
  }
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      const user = validateLogin(username, password);
      if (user) {
        if (user.role === role) {
          onLogin(user);
        } else {
          setError(`This account does not have ${role} privileges.`);
        }
      } else {
        setError('Invalid username or password.');
      }
      setIsLoading(false);
    }, 800);
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
          <p className="text-[#a89f91]">
            Enter your credentials to access the portal
          </p>
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

          <button
            type="button"
            onClick={() => setMode('signup')}
            className="w-full text-sm text-amber-400 mt-3 hover:text-amber-300 transition-colors"
          >
            Create a new account
          </button>

          {/* Demo helper text */}
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400/80 text-center">
            <p className="font-medium mb-1">Demo Credentials:</p>
            {role === 'waiter' && <p>Username: jeanpaul / Password: waiter123</p>}
            {role === 'supervisor' &&
            <p>Username: diane / Password: super123</p>
            }
            {role === 'manager' &&
            <p>Username: patrick / Password: manager123</p>
            }
          </div>
        </form>
      </motion.div>
    </div>);

}