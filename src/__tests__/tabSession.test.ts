import { describe, it, expect, beforeEach } from 'vitest';
import '../lib/tabSession';

// sessionStorage is per tab, localStorage is shared. "Switching tabs" below is
// simulated by swapping what this test's sessionStorage holds.
describe('tabSession', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps a tab on its own tenant when another tab logs into a different one', () => {
    // Tab 1 logs into tenant A
    localStorage.setItem('restaurantId', 'tenant-A');
    localStorage.setItem('staffId', 'manager-A');
    const tab1 = { restaurantId: sessionStorage.getItem('restaurantId'), staffId: sessionStorage.getItem('staffId') };

    // Tab 2 (fresh session) logs into tenant B
    sessionStorage.clear();
    localStorage.setItem('restaurantId', 'tenant-B');
    localStorage.setItem('staffId', 'manager-B');

    // Back in tab 1: still tenant A
    sessionStorage.clear();
    sessionStorage.setItem('restaurantId', tab1.restaurantId!);
    sessionStorage.setItem('staffId', tab1.staffId!);
    expect(localStorage.getItem('restaurantId')).toBe('tenant-A');
    expect(localStorage.getItem('staffId')).toBe('manager-A');

    // A brand-new tab starts from the most recent login
    sessionStorage.clear();
    expect(localStorage.getItem('restaurantId')).toBe('tenant-B');
  });

  it('removes keys from both the tab and the shared store on logout', () => {
    localStorage.setItem('authUser', '{"id":"x"}');
    localStorage.removeItem('authUser');
    expect(sessionStorage.getItem('authUser')).toBeNull();
    sessionStorage.clear();
    expect(localStorage.getItem('authUser')).toBeNull();
  });

  it('leaves other keys shared as before', () => {
    localStorage.setItem('theme', 'dark');
    expect(sessionStorage.getItem('theme')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
