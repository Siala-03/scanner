import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
type ThemeScope = 'default' | 'customer' | 'waiter' | 'supervisor' | 'manager' | 'kitchen' | 'superadmin' | 'supplier';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
});

const ROLE_SCOPES = new Set<ThemeScope>([
  'customer',
  'waiter',
  'supervisor',
  'manager',
  'kitchen',
  'superadmin',
  'supplier',
]);

function normalizeScope(value: string | null | undefined): ThemeScope {
  if (!value) return 'default';
  const lower = value.toLowerCase() as ThemeScope;
  return ROLE_SCOPES.has(lower) ? lower : 'default';
}

function getScopeFromPath(pathname: string): ThemeScope | null {
  if (/^\/r\/[^/]+\/t\/\d+/.test(pathname) || /^\/t\/\d+/.test(pathname)) return 'customer';
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return null;
  return normalizeScope(segment);
}

function getCurrentScope(): ThemeScope {
  const byPath = getScopeFromPath(window.location.pathname);
  if (byPath && byPath !== 'default') return byPath;
  return normalizeScope(localStorage.getItem('selectedRole'));
}

function getThemeStorageKey(scope: ThemeScope): string {
  return `theme:${scope}`;
}

function readThemeForScope(scope: ThemeScope): Theme {
  if (scope === 'customer') return 'dark';
  const scoped = localStorage.getItem(getThemeStorageKey(scope));
  if (scoped === 'light' || scoped === 'dark') return scoped;
  const legacy = localStorage.getItem('theme');
  return legacy === 'light' ? 'light' : 'dark';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scope, setScope] = useState<ThemeScope>(() => getCurrentScope());
  const [theme, setTheme] = useState<Theme>(() => readThemeForScope(getCurrentScope()));

  useEffect(() => {
    const root = document.documentElement;
    const effectiveTheme = scope === 'customer' ? 'dark' : theme;
    if (effectiveTheme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [scope, theme]);

  useEffect(() => {
    const syncScope = () => {
      const nextScope = getCurrentScope();
      setScope(nextScope);
      setTheme(readThemeForScope(nextScope));
    };

    window.addEventListener('popstate', syncScope);
    window.addEventListener('portal-role-changed', syncScope as EventListener);
    return () => {
      window.removeEventListener('popstate', syncScope);
      window.removeEventListener('portal-role-changed', syncScope as EventListener);
    };
  }, []);

  const toggleTheme = () => {
    if (scope === 'customer') return;
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(getThemeStorageKey(scope), next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
