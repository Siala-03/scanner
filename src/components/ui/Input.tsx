import React from 'react';
interface InputProps extends
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}
export function Input({
  label,
  error,
  icon,
  size = 'md',
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-4 py-3 text-lg'
  };
  return (
    <div className={`w-full ${className}`}>
      {label &&
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">

          {label}
        </label>
      }
      <div className="relative">
        {icon &&
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </div>
        }
        <input
          id={inputId}
          className={`
            w-full rounded-lg border transition-colors duration-200
            ${icon ? 'pl-10' : ''}
            ${sizeStyles[size]}
            ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-amber-500 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'}
            focus:outline-none focus:ring-2 focus:ring-offset-0
            placeholder:text-slate-400
          `}
          {...props} />

      </div>
      {error &&
      <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>
      }
    </div>);

}
interface TextAreaProps extends
  React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function TextArea({
  label,
  error,
  className = '',
  id,
  ...props
}: TextAreaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className={`w-full ${className}`}>
      {label &&
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">

          {label}
        </label>
      }
      <textarea
        id={inputId}
        className={`
          w-full rounded-lg border px-4 py-2 transition-colors duration-200
          ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-300 focus:border-amber-500 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'}
          focus:outline-none focus:ring-2 focus:ring-offset-0
          placeholder:text-slate-400
          resize-none
        `}
        {...props} />

      {error &&
      <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>
      }
    </div>);

}