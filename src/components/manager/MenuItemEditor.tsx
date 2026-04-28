import React, { useEffect, useState } from 'react';
import { MenuItem, MenuCategory, MenuCategoryInfo, ModifierGroup, ModifierItem } from '../../types';
import { Modal } from '../ui/Modal';
import { Input, TextArea } from '../ui/Input';
import { Button } from '../ui/Button';

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
interface MenuItemEditorProps {
  item?: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<MenuItem>) => void;
  categories: MenuCategoryInfo[];
  onAddCategory: (category: { id: string; name: string; emoji: string }) => void;
}
// Categories that go to bar/service only — everything else goes to kitchen
const DRINK_CATEGORIES = new Set([
  'beers', 'wine', 'alcoholic-drinks', 'soft-drinks', 'coffee',
  'tea', 'juices', 'cocktails', 'mocktails', 'non-alcoholic', 'water', 'drinks', 'beverages',
]);

function categoryRequiresKitchen(category: string): boolean {
  return !DRINK_CATEGORIES.has(category.toLowerCase());
}

const EMOJI_OPTIONS = [
'🍔',
'🍕',
'🥗',
'🍝',
'🥩',
'🐟',
'🍗',
'🥪',
'🌯',
'🍳',
'🥞',
'🍹',
'🍸',
'🍷',
'🍺',
'🥤',
'☕',
'🧃'];

export function MenuItemEditor({
  item,
  isOpen,
  onClose,
  onSave,
  categories,
  onAddCategory
}: MenuItemEditorProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'lunch' as MenuCategory,
    emoji: '🍽️',
    prepTime: '',
    isAvailable: true,
    isPopular: false,
    requiresKitchen: true,
  });
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [categoryMode, setCategoryMode] = useState<'existing' | 'new'>('existing');
  const [newCategory, setNewCategory] = useState({ id: '', name: '', emoji: '🍽️' });

  const categoryOptions = categories;
  useEffect(() => {
    if (item) {
      const cat = item.category || 'lunch';
      setFormData({
        name: item.name || '',
        description: item.description || '',
        price: item.price !== undefined && item.price !== null ? item.price.toString() : '',
        category: cat,
        emoji: item.emoji || '🍽️',
        prepTime: item.prepTime !== undefined && item.prepTime !== null ? item.prepTime.toString() : '',
        isAvailable: item.isAvailable ?? true,
        isPopular: item.isPopular ?? false,
        requiresKitchen: item.requiresKitchen ?? categoryRequiresKitchen(cat),
      });
      setModifierGroups(item.modifiers ? JSON.parse(JSON.stringify(item.modifiers)) : []);
      setCategoryMode('existing');
      setNewCategory({ id: '', name: '', emoji: '🍽️' });
    } else {
      setFormData({
        name: '',
        description: '',
        price: '',
        category: 'lunch',
        emoji: '🍽️',
        prepTime: '',
        isAvailable: true,
        isPopular: false,
        requiresKitchen: true,
      });
      setModifierGroups([]);
      setCategoryMode('existing');
      setNewCategory({ id: '', name: '', emoji: '🍽️' });
    }
  }, [item, isOpen]);

  // Modifier group helpers
  function addGroup() {
    setModifierGroups(g => [...g, { id: uid(), name: '', required: false, maxSelections: 1, items: [] }]);
  }
  function removeGroup(gid: string) {
    setModifierGroups(g => g.filter(x => x.id !== gid));
  }
  function updateGroup(gid: string, patch: Partial<ModifierGroup>) {
    setModifierGroups(g => g.map(x => x.id === gid ? { ...x, ...patch } : x));
  }
  function addModifierItem(gid: string) {
    setModifierGroups(g => g.map(x => x.id === gid
      ? { ...x, items: [...x.items, { id: uid(), name: '', priceAdjustment: 0 }] }
      : x));
  }
  function removeModifierItem(gid: string, iid: string) {
    setModifierGroups(g => g.map(x => x.id === gid
      ? { ...x, items: x.items.filter(i => i.id !== iid) }
      : x));
  }
  function updateModifierItem(gid: string, iid: string, patch: Partial<ModifierItem>) {
    setModifierGroups(g => g.map(x => x.id === gid
      ? { ...x, items: x.items.map(i => i.id === iid ? { ...i, ...patch } : i) }
      : x));
  }
  const handleSubmit = () => {
    let categoryToSave: MenuCategory = formData.category;
    if (categoryMode === 'new') {
      const id = newCategory.id.trim();
      const name = newCategory.name.trim();
      const emoji = newCategory.emoji.trim();
      if (id && name && emoji) {
        onAddCategory({ id, name, emoji });
        categoryToSave = id as MenuCategory;
      }
    }

    const parsedPrice = Number.isFinite(Number(formData.price)) ? Number(formData.price) : 0;
    const parsedPrepTime = Number.isFinite(Number(formData.prepTime)) ? Number(formData.prepTime) : 15;

    onSave({
      ...item,
      name: formData.name.trim(),
      description: formData.description.trim(),
      price: parsedPrice,
      category: categoryToSave,
      emoji: formData.emoji,
      prepTime: parsedPrepTime,
      isAvailable: formData.isAvailable,
      isPopular: formData.isPopular,
      requiresKitchen: formData.requiresKitchen,
      modifiers: modifierGroups.filter(g => g.name.trim()),
    });
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? 'Edit Menu Item' : 'Add Menu Item'}
      size="lg">

      <div className="space-y-4">
        {/* Emoji Picker */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Icon
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((emoji) =>
            <button
              key={emoji}
              type="button"
              onClick={() =>
              setFormData({
                ...formData,
                emoji
              })
              }
              className={`w-10 h-10 text-xl rounded-lg transition-all ${formData.emoji === emoji ? 'bg-amber-500 ring-2 ring-amber-400' : 'bg-slate-700 hover:bg-slate-600'}`}>

                {emoji}
              </button>
            )}
          </div>
        </div>

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) =>
          setFormData({
            ...formData,
            name: e.target.value
          })
          }
          placeholder="e.g., Classic Burger" />


        <TextArea
          label="Description"
          value={formData.description}
          onChange={(e) =>
          setFormData({
            ...formData,
            description: e.target.value
          })
          }
          placeholder="Describe the item..."
          rows={3} />


        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Price (RWF)"
            type="number"
            step="100"
            value={formData.price}
            onChange={(e) =>
            setFormData({
              ...formData,
              price: e.target.value
            })
            }
            placeholder="0" />


          <Input
            label="Prep Time (min)"
            type="number"
            value={formData.prepTime}
            onChange={(e) =>
            setFormData({
              ...formData,
              prepTime: e.target.value
            })
            }
            placeholder="15" />

        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Category
          </label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setCategoryMode('existing')}
              className={`px-3 py-2 rounded-lg text-sm border ${
                categoryMode === 'existing'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Pick existing
            </button>
            <button
              type="button"
              onClick={() => setCategoryMode('new')}
              className={`px-3 py-2 rounded-lg text-sm border ${
                categoryMode === 'new'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Add new category
            </button>
          </div>

          {categoryMode === 'new' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <Input
                label="Category ID"
                value={newCategory.id}
                onChange={(e) =>
                  setNewCategory((p) => ({ ...p, id: e.target.value }))
                }
                placeholder="e.g. desserts"
              />
              <Input
                label="Name"
                value={newCategory.name}
                onChange={(e) =>
                  setNewCategory((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Desserts"
              />
              <Input
                label="Emoji"
                value={newCategory.emoji}
                onChange={(e) =>
                  setNewCategory((p) => ({ ...p, emoji: e.target.value }))
                }
                placeholder="🍰"
              />
            </div>
          )}

          <select
            value={formData.category}
            onChange={(e) => {
              const cat = e.target.value as MenuCategory;
              setFormData((prev) => ({
                ...prev,
                category: cat,
                // Auto-update requiresKitchen only when the user hasn't manually overridden it
                requiresKitchen: categoryRequiresKitchen(cat),
              }));
            }}
            className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-amber-500">

            {categoryOptions.map((cat) =>
            <option key={cat.id} value={cat.id}>
                {cat.emoji} {cat.name}
              </option>
            )}
          </select>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isAvailable}
              onChange={(e) =>
              setFormData({
                ...formData,
                isAvailable: e.target.checked
              })
              }
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500" />

            <span className="text-slate-300">Available</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isPopular}
              onChange={(e) =>
              setFormData({
                ...formData,
                isPopular: e.target.checked
              })
              }
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500" />

            <span className="text-slate-300">Mark as Popular</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requiresKitchen}
              onChange={(e) =>
                setFormData({ ...formData, requiresKitchen: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500" />
            <span className="text-slate-300">Requires Kitchen</span>
          </label>
        </div>

        {/* Modifier Groups */}
        <div className="border-t border-slate-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-300">Modifier Groups</label>
            <button
              type="button"
              onClick={addGroup}
              className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
            >
              + Add Group
            </button>
          </div>

          {modifierGroups.length === 0 && (
            <p className="text-xs text-slate-500 italic">No modifier groups. Add one to let customers customise this item (e.g. Size, Toppings).</p>
          )}

          <div className="space-y-4">
            {modifierGroups.map(group => (
              <div key={group.id} className="rounded-lg border border-slate-600 bg-slate-800 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Group name (e.g. Size, Toppings)"
                    value={group.name}
                    onChange={e => updateGroup(group.id, { name: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={group.required}
                      onChange={e => updateGroup(group.id, { required: e.target.checked })}
                      className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-amber-500"
                    />
                    Required
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">Max</span>
                    <input
                      type="number"
                      min={1}
                      className="w-12 px-1.5 py-1 rounded bg-slate-700 border border-slate-600 text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                      value={group.maxSelections}
                      onChange={e => updateGroup(group.id, { maxSelections: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    className="text-slate-500 hover:text-red-400 text-sm px-1"
                  >✕</button>
                </div>

                <div className="space-y-2 pl-2">
                  {group.items.map(opt => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        className="flex-1 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Option name (e.g. Large)"
                        value={opt.name}
                        onChange={e => updateModifierItem(group.id, opt.id, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        step="50"
                        className="w-24 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="+0 RWF"
                        value={opt.priceAdjustment}
                        onChange={e => updateModifierItem(group.id, opt.id, { priceAdjustment: Number(e.target.value) || 0 })}
                      />
                      <span className="text-xs text-slate-500">RWF</span>
                      <button
                        type="button"
                        onClick={() => removeModifierItem(group.id, opt.id)}
                        className="text-slate-500 hover:text-red-400 text-xs"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addModifierItem(group.id)}
                    className="text-xs text-amber-400 hover:text-amber-300 mt-1"
                  >
                    + Add option
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={handleSubmit}>
            {item ? 'Save Changes' : 'Add Item'}
          </Button>
        </div>
      </div>
    </Modal>);

}