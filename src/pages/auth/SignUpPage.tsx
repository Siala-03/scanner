import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, MailIcon, PhoneIcon, UserIcon, LockIcon } from 'lucide-react';
import type { Staff, StaffRole } from '../../types';
import { Button } from '../../components/ui/Button';
import { signUpStaff } from '../../api/auth';
import { ApiError } from '../../api/http';

interface SignUpPageProps {
  role: StaffRole;
  onSignedUp: (user: Staff) => void;
  onBack: () => void;
}

export function SignUpPage({ role, onSignedUp, onBack }: SignUpPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    console.log('Signup attempt:', { username, email, role });

    try {
      let staff: Staff;

      if (role === 'manager') {
        console.log('Creating manager account...');
        staff = await signUpStaff({
          name,
          email,
          phone,
          role: 'manager',
          username,
          password
        });
      } else {
        setError('Account creation is handled through the manager dashboard. Please contact your manager.');
        return;
      }

      console.log('Signup successful:', staff);
      onSignedUp(staff);
    } catch (err) {
      console.error('Signup error:', err);
      let errorMessage = 'Failed to create account. Please try again.';

      if (err instanceof ApiError) {
        switch (err.status) {
          case 0:
            errorMessage = 'Cannot connect to server. Please check your internet connection and try again.';
            break;
          case 400:
            errorMessage = 'Invalid information provided. Please check all fields.';
            break;
          case 409:
            errorMessage = 'Username or email already exists. Please choose different credentials.';
            break;
          case 403:
            errorMessage = 'Account creation not allowed. Please contact your administrator.';
            break;
          case 500:
            errorMessage = 'Server error. Please try again later.';
            break;
          default:
            errorMessage = err.message || 'Failed to create account. Please try again.';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors";

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <button
        onClick={onBack}
        className="fixed top-4 left-4 z-50 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
      >
        <ArrowLeftIcon className="w-5 h-5" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl"
      >
        {role !== 'manager' && (
          <div className="mb-4 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-200">
              Only managers can register new staff accounts. Please ask your manager to create your credentials.
            </p>
          </div>
        )}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            {roleTitle} Sign Up
          </h1>
          <p className="text-slate-400">
            Create a new account to access the portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <UserIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Your full name"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">
              Email
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <MailIcon className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">
              Phone
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <PhoneIcon className="w-5 h-5" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+1 555-0101"
                required
              />
            </div>
          </div>

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
                className={inputClass}
                placeholder="Choose a username"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-100 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <LockIcon className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Create password"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-100 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <LockIcon className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Repeat password"
                  required
                  minLength={6}
                />
              </div>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            className="mt-4"
          >
            Create Account
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
