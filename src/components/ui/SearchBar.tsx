import React, { useCallback, useEffect, useState } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className = ''
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, value]);
  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="
          w-full pl-10 pr-10 py-2.5 rounded-xl
          bg-slate-100 dark:bg-slate-800
          border border-transparent
          text-slate-900 dark:text-white
          placeholder:text-slate-400
          focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20
          transition-all duration-200
        " />









      {localValue &&
      <button
        onClick={handleClear}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-label="Clear search">

          <XIcon className="w-4 h-4" />
        </button>
      }
    </div>);

}