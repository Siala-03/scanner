import React from 'react';
import { Button } from './Button';
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = ''
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>

      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 text-slate-400">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        {title}
      </h3>
      {description &&
      <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          {description}
        </p>
      }
      {action &&
      <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      }
    </div>);

}