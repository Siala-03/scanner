import React, { useEffect, useState } from 'react';
import { MenuItem, MenuCategory } from '../../types';
import { menuCategories } from '../../data/menuData';
import { Modal } from '../ui/Modal';
import { Input, TextArea } from '../ui/Input';
import { Button } from '../ui/Button';
interface MenuItemEditorProps {
  item?: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<MenuItem>) => void;
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
  onSave
}: MenuItemEditorProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'lunch' as MenuCategory,
    emoji: '🍽️',
    prepTime: '',
    isAvailable: true,
    isPopular: false
  });
  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        description: item.description,
        price: item.price.toString(),
        category: item.category,
        emoji: item.emoji,
        prepTime: item.prepTime.toString(),
        isAvailable: item.isAvailable,
        isPopular: item.isPopular
      });
    } else {
      setFormData({
        name: '',
        description: '',
        price: '',
        category: 'lunch',
        emoji: '🍽️',
        prepTime: '',
        isAvailable: true,
        isPopular: false
      });
    }
  }, [item, isOpen]);
  const handleSubmit = () => {
    onSave({
      ...item,
      name: formData.name,
      description: formData.description,
      price: parseFloat(formData.price),
      category: formData.category,
      emoji: formData.emoji,
      prepTime: parseInt(formData.prepTime),
      isAvailable: formData.isAvailable,
      isPopular: formData.isPopular
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
          <select
            value={formData.category}
            onChange={(e) =>
            setFormData({
              ...formData,
              category: e.target.value as MenuCategory
            })
            }
            className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-amber-500">

            {menuCategories.map((cat) =>
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