import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'interactive';
  className?: string;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  variant = 'default',
  className = '',
  onClick,
  padding = 'md'
}: CardProps) {
  const baseStyles = 'rounded-xl border border-slate-700 bg-slate-800/70 overflow-hidden shadow-[0_8px_24px_-16px_rgba(15,23,42,0.45)]';
  const variantStyles = {
    default: '',
    elevated: 'shadow-lg',
    interactive:
    'hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-slate-600'
  };
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };
  const CardComponent = onClick ? 'button' : 'div';
  return (
    <CardComponent
      onClick={onClick}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${onClick ? 'w-full text-left' : ''}
        ${className}
      `}>

      {children}
    </CardComponent>);
}
