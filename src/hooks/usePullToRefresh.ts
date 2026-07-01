import { useEffect, useRef } from 'react';

export function usePullToRefresh(onRefresh?: () => void) {
  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    if (!window.matchMedia('(display-mode: standalone)').matches) return;

    const threshold = 80;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!pulling.current) return;
      pulling.current = false;
      const diff = e.changedTouches[0].clientY - startY.current;
      if (diff > threshold) {
        if (onRefresh) {
          onRefresh();
        } else {
          window.location.reload();
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh]);
}
