import { useState, useMemo } from 'react';
import { PlusIcon, TrashIcon, XIcon, Settings2Icon } from 'lucide-react';

export interface SectionGroup {
  id: string;
  name: string;
  categories: string[]; // raw lowercase category values
  color: string;
}

const COLOR_PRESETS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b',
  '#a78bfa', '#34d399', '#60a5fa', '#f87171', '#14b8a6',
];

interface Props {
  sections: SectionGroup[];
  availableCategories: string[]; // all known categories across menu + orders
  onSave: (sections: SectionGroup[]) => void;
  onClose: () => void;
}

function makeId() {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function SectionConfigModal({ sections, availableCategories, onSave, onClose }: Props) {
  const [local, setLocal] = useState<SectionGroup[]>(() =>
    JSON.parse(JSON.stringify(sections))
  );
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  // Categories already assigned in any section
  const assignedCats = useMemo(
    () => new Set(local.flatMap((s) => s.categories)),
    [local],
  );

  // Categories not in any section
  const unassigned = useMemo(
    () => availableCategories.filter((c) => !assignedCats.has(c)).sort(),
    [availableCategories, assignedCats],
  );

  // Cats available to add to a specific section (not assigned elsewhere)
  const freeForSection = (sec: SectionGroup) =>
    availableCategories.filter(
      (c) => !assignedCats.has(c) || sec.categories.includes(c),
    ).sort();

  const update = (id: string, patch: Partial<SectionGroup>) =>
    setLocal((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addCat = (id: string, cat: string) =>
    setLocal((prev) =>
      prev.map((s) =>
        s.id === id && !s.categories.includes(cat)
          ? { ...s, categories: [...s.categories, cat] }
          : s,
      ),
    );

  const removeCat = (id: string, cat: string) =>
    setLocal((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, categories: s.categories.filter((c) => c !== cat) } : s,
      ),
    );

  const deleteSection = (id: string) =>
    setLocal((prev) => prev.filter((s) => s.id !== id));

  const addSection = () => {
    const usedColors = new Set(local.map((s) => s.color));
    const nextColor =
      COLOR_PRESETS.find((c) => !usedColors.has(c)) ??
      COLOR_PRESETS[local.length % COLOR_PRESETS.length];
    setLocal((prev) => [
      ...prev,
      { id: makeId(), name: 'New Section', categories: [], color: nextColor },
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-8 px-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-700">
          <div className="flex items-start gap-3">
            <Settings2Icon className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-white">Revenue Section Configuration</h2>
              <p className="text-xs text-slate-400 mt-0.5 max-w-sm">
                Group your menu categories into named revenue sections. Categories not assigned
                to any section appear under their own name in reports.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Unassigned notice ── */}
        {unassigned.length > 0 && (
          <div className="mx-6 mt-4 px-3 py-2.5 bg-slate-800/80 rounded-xl border border-slate-700 text-xs">
            <span className="font-semibold text-slate-300">Unassigned categories</span>
            <span className="text-slate-500"> (will appear as-is in the report):</span>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {unassigned.map((c) => (
                <span key={c} className="bg-slate-700 text-slate-300 rounded-md px-1.5 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Section list ── */}
        <div className="px-6 py-4 space-y-3 max-h-[440px] overflow-y-auto">
          {local.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6 italic">
              No sections configured. Add one below.
            </p>
          )}

          {local.map((section) => {
            const free = freeForSection(section).filter(
              (c) => !section.categories.includes(c),
            );
            return (
              <div
                key={section.id}
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-4"
              >
                {/* Section header row */}
                <div className="flex items-center gap-3 mb-3">

                  {/* Color swatch / picker trigger */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() =>
                        setColorPickerFor(colorPickerFor === section.id ? null : section.id)
                      }
                      className="w-7 h-7 rounded-full border-2 border-slate-600 hover:scale-110 transition-transform"
                      style={{ backgroundColor: section.color }}
                      title="Change colour"
                    />
                    {colorPickerFor === section.id && (
                      <div className="absolute top-9 left-0 z-20 bg-slate-800 border border-slate-600 rounded-xl p-2.5 shadow-2xl">
                        <div className="grid grid-cols-5 gap-1.5">
                          {COLOR_PRESETS.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                update(section.id, { color: c });
                                setColorPickerFor(null);
                              }}
                              className="w-6 h-6 rounded-full border-2 hover:scale-125 transition-transform"
                              style={{
                                backgroundColor: c,
                                borderColor: section.color === c ? 'white' : 'transparent',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Name input */}
                  <input
                    value={section.name}
                    onChange={(e) => update(section.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-white font-semibold text-sm border-b border-transparent hover:border-slate-600 focus:border-emerald-500 focus:outline-none pb-0.5 transition-colors"
                    placeholder="Section name"
                  />

                  {/* Delete */}
                  <button
                    onClick={() => deleteSection(section.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                    title="Delete section"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Category tags */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {section.categories.length === 0 && (
                    <span className="text-xs text-slate-600 italic">No categories yet —</span>
                  )}

                  {section.categories.map((cat) => (
                    <span
                      key={cat}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-slate-200"
                      style={{
                        backgroundColor: section.color + '28',
                        border: `1px solid ${section.color}55`,
                      }}
                    >
                      {cat}
                      <button
                        onClick={() => removeCat(section.id, cat)}
                        className="text-slate-400 hover:text-red-300 transition-colors"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {/* Add category dropdown */}
                  {free.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) addCat(section.id, e.target.value); }}
                      className="text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded-full px-2.5 py-0.5 cursor-pointer hover:bg-slate-600 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">+ add category</option>
                      {free.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  )}

                  {free.length === 0 && availableCategories.length > 0 && (
                    <span className="text-xs text-slate-600 italic">
                      (all known categories assigned)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-5 pt-3 border-t border-slate-700">
          <button
            onClick={addSection}
            className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 mb-4 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Section
          </button>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onSave(local); onClose(); }}
              className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
