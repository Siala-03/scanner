import { useState } from 'react';
import { ShieldIcon, WifiOffIcon, XIcon } from 'lucide-react';
import { setPin } from '../../utils/offlineAuth';

interface SetPinModalProps {
  staffId: string;
  staffName: string;
  onDone: () => void;  // called whether PIN was set or skipped
}

type Step = 'intro' | 'enter' | 'confirm' | 'done';

export function SetPinModal({ staffId, staffName, onDone }: SetPinModalProps) {
  const [step, setStep] = useState<Step>('intro');
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleDigit = (current: string, setter: (v: string) => void, maxLen: number) =>
    (digit: string) => {
      if (current.length < maxLen) setter(current + digit);
    };

  const handleBack = (current: string, setter: (v: string) => void) => () =>
    setter(current.slice(0, -1));

  const handleConfirmSubmit = async () => {
    if (firstPin !== confirmPin) {
      setMismatch(true);
      setConfirmPin('');
      return;
    }
    setSaving(true);
    try {
      await setPin(staffId, firstPin);
      setStep('done');
    } finally {
      setSaving(false);
    }
  };

  const PinDots = ({ value }: { value: string }) => (
    <div className="flex gap-3 justify-center my-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all ${
            i < value.length ? 'bg-amber-400 border-amber-400' : 'bg-transparent border-slate-500'
          }`}
        />
      ))}
    </div>
  );

  const NumpadRow = ({ digits, onDigit, onBack }: {
    digits: string;
    onDigit: (d: string) => void;
    onBack: () => void;
  }) => (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {['1','2','3','4','5','6','7','8','9'].map((d) => (
        <button key={d} onClick={() => onDigit(d)}
          className="h-12 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg active:scale-95 transition-all">
          {d}
        </button>
      ))}
      <div />
      <button onClick={() => onDigit('0')}
        className="h-12 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-lg active:scale-95 transition-all">
        0
      </button>
      <button onClick={onBack}
        className="h-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm active:scale-95 transition-all flex items-center justify-center">
        ⌫
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">

        {/* Intro */}
        {step === 'intro' && (
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                <WifiOffIcon className="w-5 h-5 text-amber-400" />
              </div>
              <button onClick={onDone} className="text-slate-500 hover:text-slate-300">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Set up offline access</h2>
            <p className="text-sm text-slate-400 mb-6">
              Hi {staffName.split(' ')[0]}! Set a 4-digit PIN so you can log in even without internet.
              Perfect for when the network is down during service.
            </p>
            <div className="space-y-3 mb-6 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>PIN is stored only on this device</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>5 wrong attempts locks you out for 5 minutes</span>
              </div>
            </div>
            <button
              onClick={() => setStep('enter')}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors mb-3"
            >
              Set up PIN
            </button>
            <button
              onClick={onDone}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Enter PIN */}
        {step === 'enter' && (
          <div className="p-6">
            <h2 className="text-base font-bold text-white text-center">Choose a PIN</h2>
            <p className="text-xs text-slate-400 text-center mt-1">Enter a 4-digit PIN</p>
            <PinDots value={firstPin} />
            <NumpadRow
              digits={firstPin}
              onDigit={handleDigit(firstPin, setFirstPin, 4)}
              onBack={handleBack(firstPin, setFirstPin)}
            />
            <button
              onClick={() => { setStep('confirm'); setMismatch(false); }}
              disabled={firstPin.length < 4}
              className="w-full mt-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Confirm PIN */}
        {step === 'confirm' && (
          <div className="p-6">
            <h2 className="text-base font-bold text-white text-center">Confirm PIN</h2>
            <p className={`text-xs text-center mt-1 ${mismatch ? 'text-red-400' : 'text-slate-400'}`}>
              {mismatch ? 'PINs did not match — try again' : 'Enter your PIN again to confirm'}
            </p>
            <PinDots value={confirmPin} />
            <NumpadRow
              digits={confirmPin}
              onDigit={handleDigit(confirmPin, setConfirmPin, 4)}
              onBack={handleBack(confirmPin, setConfirmPin)}
            />
            <button
              onClick={handleConfirmSubmit}
              disabled={confirmPin.length < 4 || saving}
              className="w-full mt-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm transition-colors"
            >
              {saving ? 'Saving…' : 'Save PIN'}
            </button>
            <button
              onClick={() => { setStep('enter'); setConfirmPin(''); setMismatch(false); }}
              className="w-full mt-2 py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <ShieldIcon className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Offline access ready</h2>
            <p className="text-sm text-slate-400 mb-6">
              Next time you open the app without internet, just enter your PIN.
            </p>
            <button
              onClick={onDone}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
