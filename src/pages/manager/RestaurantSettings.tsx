import { useEffect, useRef, useState } from 'react';
import { BuildingIcon, PhoneIcon, MailIcon, MapPinIcon, GlobeIcon, ImageIcon, SaveIcon, UploadIcon, XIcon } from 'lucide-react';
import { fetchReceiptSettings, saveReceiptSettings } from '../../api/restaurants';
import type { RestaurantReceiptSettings } from '../../api/restaurants';

interface RestaurantSettingsProps {
  restaurantId: string;
  restaurantName: string;
  onNameChange?: (name: string) => void;
  onSettingsSaved?: (settings: RestaurantReceiptSettings) => void; // notify App so logo updates live
}

const MAX_LOGO_PX = 400; // resize canvas dimension — keeps base64 small enough for DB

/** Resize + convert an image File to a base64 data-URL. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_LOGO_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png', 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function RestaurantSettings({ restaurantId, restaurantName, onNameChange, onSettingsSaved }: RestaurantSettingsProps) {
  const [name, setName] = useState(restaurantName);
  const [settings, setSettings] = useState<RestaurantReceiptSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<'success' | 'error' | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string>('Failed to save. Please try again.');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync name from parent if it changes externally
  useEffect(() => { setName(restaurantName); }, [restaurantName]);

  // Load saved settings
  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    fetchReceiptSettings(restaurantId)
      .then((s) => {
        setSettings(s);
        if (s.logo) setLogoPreview(s.logo);
      })
      .catch(() => {/* treat missing as empty */})
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const base64 = await fileToBase64(file);
      setLogoPreview(base64);
      setSettings((prev) => ({ ...prev, logo: base64 }));
    } catch {
      alert('Failed to process image. Please try another file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleLogoFile(file);
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErrorMessage('Failed to save. Please try again.');
    try {
      await saveReceiptSettings(restaurantId, settings, name.trim() || undefined);
      onNameChange?.(name.trim());
      onSettingsSaved?.(settings);
      setSaveMsg('success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save. Please try again.';
      setSaveErrorMessage(msg);
      setSaveMsg('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3500);
    }
  };

  const field = (
    label: string,
    key: keyof RestaurantReceiptSettings,
    placeholder: string,
    icon: React.ReactNode,
    type = 'text',
  ) => (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input
          type={type}
          value={(settings[key] as string) ?? ''}
          onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-2">

      {/* ── Page Title ── */}
      <div>
        <h1 className="text-xl font-bold text-white">Company Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          These details appear in staff portal headers and on customer receipts.
        </p>
      </div>

      {/* ── Logo Upload ── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-amber-400" /> Company Logo
        </h2>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-amber-500 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          {logoPreview ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={logoPreview}
                alt="Company logo preview"
                className="max-h-24 max-w-full object-contain rounded"
              />
              <span className="text-xs text-slate-400">Click or drag to replace</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <UploadIcon className="w-8 h-8" />
              <p className="text-sm">Drag & drop or click to upload logo</p>
              <p className="text-xs text-slate-500">PNG, JPG, SVG — auto-resized to fit receipts</p>
            </div>
          )}
        </div>

        {logoPreview && (
          <button
            onClick={() => { setLogoPreview(null); setSettings((p) => ({ ...p, logo: undefined })); }}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition"
          >
            <XIcon className="w-3.5 h-3.5" /> Remove logo
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ''; }}
        />
      </div>

      {/* ── Company Name ── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <BuildingIcon className="w-4 h-4 text-amber-400" /> Company Details
        </h2>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Company Name</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <BuildingIcon className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Grand Group"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
            />
          </div>
        </div>

        {field('Street Address', 'address', 'e.g. KN 4 Ave, Nyarugenge', <MapPinIcon className="w-4 h-4" />)}
        {field('City', 'city', 'e.g. Kigali', <MapPinIcon className="w-4 h-4" />)}
        {field('Country', 'country', 'e.g. Rwanda', <GlobeIcon className="w-4 h-4" />)}
      </div>

      {/* ── Contact Info ── */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <PhoneIcon className="w-4 h-4 text-amber-400" /> Contact Information
        </h2>
        {field('Phone Number', 'phone', 'e.g. +250 788 000 000', <PhoneIcon className="w-4 h-4" />, 'tel')}
        {field('Email Address', 'email', 'e.g. info@company.rw', <MailIcon className="w-4 h-4" />, 'email')}
      </div>

      {/* ── Receipt Preview hint ── */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-300">
        <strong className="text-amber-200">Receipt preview:</strong> The logo, name, address, city, country, phone and
        email will all appear at the top of every customer receipt printed from the waiter or kitchen portal.
      </div>

      {/* ── Save ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold text-sm transition"
        >
          <SaveIcon className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Settings'}
        </button>

        {saveMsg === 'success' && (
          <span className="text-sm text-emerald-400">Settings saved successfully.</span>
        )}
        {saveMsg === 'error' && (
          <span className="text-sm text-red-400">{saveErrorMessage}</span>
        )}
      </div>

    </div>
  );
}
