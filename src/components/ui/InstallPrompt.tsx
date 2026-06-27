import { useState, useEffect, useCallback } from 'react';
import { DownloadIcon, XIcon, ShareIcon } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPromptGlobal: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPromptGlobal = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event('pwa-install-ready'));
});

const DISMISS_KEY = 'servv_install_dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

function wasDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw && Date.now() - Number(raw) < DISMISS_DURATION_MS) return true;
  } catch { /* ignore */ }
  return false;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(deferredPromptGlobal);
  const [showIosHint] = useState(() => isIos() && !isInStandaloneMode() && !wasDismissed());
  const [showMobileHint] = useState(() => !isIos() && !isInStandaloneMode() && !wasDismissed());
  const [dismissed, setDismissed] = useState(() => wasDismissed());

  useEffect(() => {
    if (isInStandaloneMode() || dismissed) return;

    const handler = () => {
      setDeferredPrompt(deferredPromptGlobal);
    };
    window.addEventListener('pwa-install-ready', handler);
    return () => window.removeEventListener('pwa-install-ready', handler);
  }, [dismissed]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      deferredPromptGlobal = null;
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    deferredPromptGlobal = null;
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  if (dismissed || isInStandaloneMode()) return null;
  if (!deferredPrompt && !showIosHint && !showMobileHint) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm">
      <div className="rounded-xl border border-slate-700 bg-slate-800/95 backdrop-blur shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            {showIosHint ? (
              <ShareIcon className="w-4 h-4 text-indigo-400" />
            ) : (
              <DownloadIcon className="w-4 h-4 text-indigo-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-100">Install Servv IQ</p>
            {showIosHint ? (
              <p className="text-xs text-slate-400 mt-0.5">
                Tap the share button then <strong className="text-slate-300">"Add to Home Screen"</strong> for the best experience.
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
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="mt-3 w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 transition-colors"
          >
            Install App
          </button>
        )}
        {showMobileHint && !deferredPrompt && (
          <p className="mt-2 text-xs text-slate-500 text-center">
            {isMobile()
              ? 'Use your browser menu to add this app to your home screen.'
              : 'Click the install icon in your address bar, or use your browser\'s menu to install this app.'}
          </p>
        )}
      </div>
    </div>
  );
}
