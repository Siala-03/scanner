import { useState, useEffect } from 'react';
import { offlineSync } from '../utils/offlineSync';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOperations, setPendingOperations] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    // Update pending operations count periodically
    const updatePendingCount = async () => {
      const count = await offlineSync.getPendingOperationsCount();
      setPendingOperations(count);
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000); // Check every 5 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingOperations };
}