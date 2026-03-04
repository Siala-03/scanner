import React from 'react';
import { motion } from 'framer-motion';
interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'amber' | 'green' | 'blue' | 'red';
  className?: string;
}
export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  color = 'amber',
  className = ''
}: ProgressBarProps) {
  const percentage = Math.min(Math.max(value / max * 100, 0), 100);
  const sizeStyles = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  };
  const colorStyles = {
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    red: 'bg-red-500'
  };
  return (
    <div className={`w-full ${className}`}>
      {showLabel &&
      <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Progress
          </span>
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {Math.round(percentage)}%
          </span>
        </div>
      }
      <div
        className={`w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden ${sizeStyles[size]}`}>

        <motion.div
          className={`h-full rounded-full ${colorStyles[color]}`}
          initial={{
            width: 0
          }}
          animate={{
            width: `${percentage}%`
          }}
          transition={{
            duration: 0.5,
            ease: 'easeOut'
          }} />

      </div>
    </div>);

}