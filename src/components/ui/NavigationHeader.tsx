import React from 'react';
import { ArrowLeftIcon, MenuIcon } from 'lucide-react';

interface NavigationHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  showBack?: boolean;
}

export function NavigationHeader({ 
  title, 
  subtitle, 
  onBack, 
  actions,
  showBack = true 
}: NavigationHeaderProps) {
  return (
    <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50">
      <div className="flex items-center gap-3 p-4">
        {/* Back Button */}
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="flex-shrink-0 p-2 -ml-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        )}
        
        {/* Title Section */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-400 truncate">
              {subtitle}
            </p>
          )}
        </div>
        
        {/* Actions */}
        {actions && (
          <div className="flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact version for pages with tab navigation
export function CompactNavHeader({ 
  title, 
  onBack, 
  children 
}: { 
  title: string; 
  onBack?: () => void; 
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50">
      <div className="flex items-center gap-2 px-4 py-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex-shrink-0 p-1.5 -ml-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all duration-200"
            aria-label="Go back"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold text-white truncate">{title}</h1>
        {children && <div className="ml-auto flex gap-1">{children}</div>}
      </div>
    </div>
  );
}
