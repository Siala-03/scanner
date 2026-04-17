import React from 'react';
import { SunIcon, MoonIcon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 focus:ring-offset-slate-800 ${
        isLight ? 'bg-amber-400' : 'bg-slate-600'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transform transition-transform duration-300 ${
          isLight ? 'translate-x-8' : 'translate-x-1'
        }`}
      >
        {isLight ? (
          <SunIcon className="w-3 h-3 text-amber-500" />
        ) : (
          <MoonIcon className="w-3 h-3 text-slate-500" />
        )}
      </span>
    </button>
  );
};
