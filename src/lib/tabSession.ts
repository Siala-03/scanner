/**
 * Tab-scoped login/tenant keys.
 *
 * localStorage is shared by every tab in the browser, so logging into tenant B
 * in one tab silently switched the restaurantId/staffId of a tab still showing
 * tenant A — and actions there (e.g. creating staff) landed in tenant B.
 *
 * For the keys below, reads prefer this tab's sessionStorage, and writes go to
 * both: the tab keeps its own tenant, while localStorage still remembers the
 * last login so new tabs and app restarts start signed in. A fresh tab copies
 * ("pins") the shared value into its session on first read.
 *
 * Imported first in index.tsx so it is installed before any other module runs.
 */
const TAB_KEYS = new Set([
  'restaurantId',
  'staffId',
  'staffRole',
  'authUser',
  'selectedRole',
  'token',
  'outletType',
]);

function install(): void {
  if (typeof window === 'undefined' || !window.localStorage || !window.sessionStorage) return;
  const proto = Storage.prototype;
  const getItem = proto.getItem;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  const local = window.localStorage;
  const session = window.sessionStorage;

  proto.getItem = function (this: Storage, key: string) {
    if (this === local && TAB_KEYS.has(key)) {
      try {
        const own = getItem.call(session, key);
        if (own !== null) return own;
        const shared = getItem.call(local, key);
        if (shared !== null) setItem.call(session, key, shared);
        return shared;
      } catch {
        return getItem.call(local, key);
      }
    }
    return getItem.call(this, key);
  };

  proto.setItem = function (this: Storage, key: string, value: string) {
    if (this === local && TAB_KEYS.has(key)) {
      try { setItem.call(session, key, value); } catch { /* session storage unavailable */ }
    }
    return setItem.call(this, key, value);
  };

  proto.removeItem = function (this: Storage, key: string) {
    if (this === local && TAB_KEYS.has(key)) {
      try { removeItem.call(session, key); } catch { /* session storage unavailable */ }
    }
    return removeItem.call(this, key);
  };
}

install();

export {};
