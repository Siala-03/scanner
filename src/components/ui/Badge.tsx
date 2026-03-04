import React from 'react';
import { OrderStatus } from '../../types';
interface BadgeProps {
  children: ReactNode;
  variant?:
  'default' |
  'pending' |
  'verified' |
  'preparing' |
  'ready' |
  'served' |
  'cancelled' |
  'count';
  size?: 'sm' | 'md';
  className?: string;
}
export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = ''
}: BadgeProps) {
  const baseStyles =
  'inline-flex items-center justify-center font-medium rounded-full';
  const variantStyles = {
    default:
    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    pending:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    verified:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    preparing:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    ready:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    served: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    count: 'bg-amber-500 text-white'
  };
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  };
  return (
    <span
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}>

      {children}
    </span>);

}
export function StatusBadge({ status }: {status: OrderStatus;}) {
  const statusLabels: Record<OrderStatus, string> = {
    pending: 'Pending',
    verified: 'Verified',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Served',
    cancelled: 'Cancelled'
  };
  return <Badge variant={status}>{statusLabels[status]}</Badge>;
}