import React, { Component } from 'react';
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
  const baseStyles = 'rounded-xl bg-white dark:bg-slate-800 overflow-hidden';
  const variantStyles = {
    default: 'shadow-md',
    elevated: 'shadow-lg shadow-amber-100/50 dark:shadow-slate-900/50',
    interactive:
    'shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer'
  };
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      onClick={onClick}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${onClick ? 'w-full text-left' : ''}
        ${className}
      `}>

      {children}
    </Component>);

}