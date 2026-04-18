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
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{ outline: 'none' }}
      className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-amber-500 ${
        isLight ? 'bg-amber-400' : 'bg-slate-600'
      }`}
    >
      {/* track icons */}
      <SunIcon  className={`absolute right-1.5 w-3 h-3 transition-opacity ${isLight ? 'opacity-0' : 'opacity-40 text-slate-300'}`} />
      <MoonIcon className={`absolute left-1.5  w-3 h-3 transition-opacity ${isLight ? 'opacity-40 text-amber-700' : 'opacity-0'}`} />

      {/* sliding thumb */}
      <span
        className={`relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transform transition-transform duration-300 ${
          isLight ? 'translate-x-8' : 'translate-x-1'
        }`}
      >
        {isLight ? (
          <SunIcon  className="w-3 h-3 text-amber-500" />
        ) : (
          <MoonIcon className="w-3 h-3 text-slate-500" />
        )}
      </span>
    </button>
  );
};
