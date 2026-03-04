import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckIcon,
  ClockIcon,
  ChefHatIcon,
  BellIcon,
  UtensilsIcon } from
'lucide-react';
import { OrderStatus } from '../../types';
interface OrderTrackerProps {
  status: OrderStatus;
  createdAt: Date;
  estimatedWaitTime?: number;
}
const steps = [
{
  id: 'pending',
  label: 'Order Received',
  icon: ClockIcon
},
{
  id: 'preparing',
  label: 'Preparing',
  icon: ChefHatIcon
},
{
  id: 'ready',
  label: 'Ready',
  icon: BellIcon
},
{
  id: 'served',
  label: 'Served',
  icon: UtensilsIcon
}];

const statusToStep: Record<OrderStatus, number> = {
  pending: 0,
  verified: 1,
  preparing: 1,
  ready: 2,
  served: 3,
  cancelled: -1
};
export function OrderTracker({
  status,
  createdAt,
  estimatedWaitTime = 15
}: OrderTrackerProps) {
  const [currentStep, setCurrentStep] = useState(statusToStep[status]);
  const [elapsedTime, setElapsedTime] = useState(0);
  useEffect(() => {
    setCurrentStep(statusToStep[status]);
  }, [status]);
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - createdAt.getTime()) / 60000);
      setElapsedTime(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);
  if (status === 'cancelled') {
    return (
      <div className="bg-red-50 rounded-xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">❌</span>
        </div>
        <h3 className="font-semibold text-red-700 mb-1">Order Cancelled</h3>
        <p className="text-sm text-red-600">This order has been cancelled.</p>
      </div>);

  }
  return (
    <div className="bg-white rounded-xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-slate-900">Order Status</h3>
        <div className="text-sm text-slate-500">
          {elapsedTime < estimatedWaitTime ?
          <span className="text-green-600">
              ~{estimatedWaitTime - elapsedTime} min remaining
            </span> :

          <span className="text-amber-600">Taking longer than expected</span>
          }
        </div>
      </div>

      <div className="relative">
        {/* Progress line */}
        <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-200" />
        <motion.div
          className="absolute left-6 top-6 w-0.5 bg-amber-500 origin-top"
          initial={{
            scaleY: 0
          }}
          animate={{
            scaleY: currentStep / (steps.length - 1)
          }}
          transition={{
            duration: 0.5,
            ease: 'easeOut'
          }}
          style={{
            height: `calc(100% - 3rem)`
          }} />


        {/* Steps */}
        <div className="space-y-6">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-4">
                <motion.div
                  initial={{
                    scale: 0.8
                  }}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                    backgroundColor:
                    isCompleted || isCurrent ? '#f59e0b' : '#e2e8f0'
                  }}
                  transition={{
                    duration: 0.3
                  }}
                  className={`
                    relative z-10 w-12 h-12 rounded-full flex items-center justify-center
                    ${isCompleted || isCurrent ? 'text-white' : 'text-slate-400'}
                  `}>

                  {isCompleted ?
                  <CheckIcon className="w-5 h-5" /> :

                  <Icon className="w-5 h-5" />
                  }
                </motion.div>

                <div className="flex-1">
                  <p
                    className={`font-medium ${isCurrent ? 'text-amber-600' : isCompleted ? 'text-slate-900' : 'text-slate-400'}`}>

                    {step.label}
                  </p>
                  {isCurrent &&
                  <motion.p
                    initial={{
                      opacity: 0,
                      y: -5
                    }}
                    animate={{
                      opacity: 1,
                      y: 0
                    }}
                    className="text-sm text-slate-500">

                      {index === 0 && 'Your order has been received'}
                      {index === 1 && 'Our team is preparing your order'}
                      {index === 2 && 'Your order is ready for pickup'}
                      {index === 3 && 'Enjoy your meal!'}
                    </motion.p>
                  }
                </div>
              </div>);

          })}
        </div>
      </div>
    </div>);

}