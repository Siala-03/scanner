import { ReactNode } from 'react';
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
    'bg-slate-100 text-slate-700',
    pending:
    'bg-yellow-100 text-yellow-700',
    verified:
    'bg-blue-100 text-blue-700',
    preparing:
    'bg-orange-100 text-orange-700',
    ready:
    'bg-green-100 text-green-700',
    served: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-700',
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
