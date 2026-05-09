import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserIcon, PhoneIcon, MailIcon, GiftIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { createOrFindCustomer } from '../../api/loyalty';
import type { Customer } from '../../types';

interface CustomerIdentificationProps {
  onCustomerIdentified: (customer: Customer | null) => void;
  identifiedCustomer?: Customer | null;
  restaurantId?: string;
}

export function CustomerIdentification({
  onCustomerIdentified,
  identifiedCustomer,
  restaurantId: restaurantIdProp,
}: CustomerIdentificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone) {
      setError('Phone number is required.');
      return;
    }

    setIsLoading(true);
    try {
      const restaurantId = restaurantIdProp || localStorage.getItem('restaurantId');
      if (!restaurantId) {
        setError('Unable to join loyalty program: restaurant context is missing.');
        return;
      }
      const customer = await createOrFindCustomer({ phone, email, name, restaurantId });
      onCustomerIdentified(customer);
      setIsExpanded(false);
    } catch (err: any) {
      console.error('Customer identification error:', err);
      // Provide more specific error messages
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else if (err.status === 400) {
        setError('Invalid information provided. Please check your phone number and try again.');
      } else if (err.status === 500) {
        setError('Server error. Our team has been notified. Please try again later.');
      } else {
        setError('Unable to join loyalty program. Please try again or continue without joining.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    onCustomerIdentified(null);
    setIsExpanded(false);
  };

  if (identifiedCustomer) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-4 border border-blue-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <GiftIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {identifiedCustomer.name || 'Loyal Customer'}
              </p>
              <p className="text-sm text-slate-600">
                {identifiedCustomer.totalPoints} points available
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCustomerIdentified(null)}
          >
            Change
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4"
    >
      {!isExpanded ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <GiftIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Earn Loyalty Points</p>
                <p className="text-sm text-slate-600">Join our rewards program</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkip}
              >
                Skip
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="animate-pulse"
              >
                Join Now
              </Button>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-4">
            <UserIcon className="w-5 h-5 text-slate-600" />
            <h3 className="font-medium text-slate-900">Customer Information</h3>
          </div>

          <div className="space-y-3">
            <Input
              label="Full Name (Optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
            />

            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              icon={<PhoneIcon className="w-4 h-4" />}
            />

            <Input
              label="Email Address (Optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              icon={<MailIcon className="w-4 h-4" />}
            />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsExpanded(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="flex-1"
              >
                Join Program
              </Button>
            </div>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}