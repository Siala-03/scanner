import { useState, useEffect, useCallback } from 'react';
import { DownloadIcon, XIcon, ShareIcon } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'servv_install_dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;

    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw && Date.now() - Number(raw) < DISMISS_DURATION_MS) {
        setDismissed(true);
        return;
      }
    } catch { /* ignore */ }

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  if (dismissed || isInStandaloneMode()) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-bottom-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800/95 backdrop-blur shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            {showIosHint ? (
              <ShareIcon className="w-4.5 h-4.5 text-indigo-400" />
            ) : (
              <DownloadIcon className="w-4.5 h-4.5 text-indigo-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-100">Install Servv IQ</p>
            {showIosHint ? (
              <p className="text-xs text-slate-400 mt-0.5">
                Tap <ShareIcon className="inline w-3 h-3 -mt-0.5" /> then <strong>"Add to Home Screen"</strong> for the best experience.
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">
                Install the app for faster access and offline support.
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {!showIosHint && (
          <button
            onClick={handleInstall}
            className="mt-3 w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 transition-colors"
          >
            Install App
          </button>
        )}
      </div>
    </div>
  );
}
