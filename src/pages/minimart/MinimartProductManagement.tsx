import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PlusIcon, EditIcon, TrashIcon, RefreshCwIcon,
  CheckIcon, XIcon, SearchIcon, ToggleLeftIcon, ToggleRightIcon,
} from 'lucide-react';
import {
  fetchMenu, createMenuItem, updateMenuItem,
  deleteMenuItem, toggleMenuItemAvailability,
} from '../../api/menu';
import { formatPrice } from '../../utils/currency';
import type { MenuItem } from '../../lib/supabase';

const CUSTOM_CATS_KEY = 'minimart_custom_categories';

function loadCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCustomCategories(cats: string[]) {
  localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(cats));
}

// ── CategorySelect ────────────────────────────────────────────────────────────
// Dropdown of existing categories + "＋ New category" option that reveals
// an inline text input.
interface CategorySelectProps {
  value: string;
  onChange: (v: string) => void;
  categories: string[];       // existing cats (no 'all' sentinel)
  onNewCategory: (v: string) => void;
  className?: string;
  small?: boolean;            // compact variant for inline table edit
}

function CategorySelect({ value, onChange, categories, onNewCategory, className = '', small }: CategorySelectProps) {
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingNew) inputRef.current?.focus();
  }, [addingNew]);

  const commitNew = () => {
    const trimmed = newName.trim();
    if (!trimmed) { cancelNew(); return; }
    onNewCategory(trimmed);
    onChange(trimmed);
    setAddingNew(false);
    setNewName('');
  };

  const cancelNew = () => {
    setAddingNew(false);
    setNewName('');
    // Restore previous value or first existing category
    if (!categories.includes(value)) onChange(categories[0] || '');
  };

  const baseInput = small
    ? 'px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 focus:outline-none'
    : 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500';

  if (addingNew) {
    return (
      <div className={`flex gap-1 ${small ? '' : 'w-full'} ${className}`}>
        <input
          ref={inputRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitNew(); }
            if (e.key === 'Escape') cancelNew();
          }}
          placeholder="Category name…"
          className={`flex-1 min-w-0 ${baseInput}`}
        />
        <button
          type="button"
          onClick={commitNew}
          className="shrink-0 p-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 transition-colors"
          title="Confirm"
        >
          <CheckIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={cancelNew}
          className="shrink-0 p-1.5 rounded bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          title="Cancel"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__new__') {
          setAddingNew(true);
        } else {
          onChange(e.target.value);
        }
      }}
      className={`${small ? 'px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 focus:outline-none' : 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500'} ${className}`}
    >
      {categories.length === 0 && (
        <option value="" disabled>Select or add category</option>
      )}
      {categories.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
      <option value="__new__">＋ New category…</option>
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ProductForm {
  name: string;
  category: string;
  price: string;
}

const EMPTY_FORM: ProductForm = { name: '', category: '', price: '' };

export function MinimartProductManagement() {
  const [products, setProducts]         = useState<MenuItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [customCats, setCustomCats]     = useState<string[]>(loadCustomCategories);

  // Add form
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState<ProductForm>(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<ProductForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchMenu();
      setProducts(items as MenuItem[]);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge categories from products + custom list (deduplicated, sorted)
  const productCats = Array.from(new Set(products.map((p) => p.category))).sort();
  const allCats = Array.from(new Set([...productCats, ...customCats])).sort();
  const filterOptions = ['all', ...allCats];

  const addCustomCategory = (name: string) => {
    setCustomCats((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name].sort();
      saveCustomCategories(next);
      return next;
    });
  };

  const filtered = products.filter((p) => {
    const matchCat = filterCategory === 'all' || p.category === filterCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const validateForm = (f: ProductForm): string => {
    if (!f.name.trim()) return 'Product name is required.';
    if (!f.category.trim()) return 'Category is required.';
    const price = parseFloat(f.price);
    if (isNaN(price) || price < 0) return 'Enter a valid price.';
    return '';
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateForm(addForm);
    if (err) { setAddError(err); return; }
    setAddSaving(true);
    setAddError('');
    try {
      const created = await createMenuItem({
        name: addForm.name.trim(),
        category: addForm.category.trim(),
        price: parseFloat(addForm.price),
        emoji: '📦',
        description: '',
        prep_time: 0,
        requires_kitchen: false,
        is_available: true,
        is_popular: false,
      } as any);
      setProducts((prev) => [...prev, created as MenuItem]);
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add product.');
    } finally {
      setAddSaving(false);
    }
  };

  const startEdit = (p: MenuItem) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, category: p.category, price: String(p.price) });
  };

  const handleEditSave = async (id: string) => {
    const err = validateForm(editForm);
    if (err) return;
    setEditSaving(true);
    try {
      const updated = await updateMenuItem(id, {
        name: editForm.name.trim(),
        category: editForm.category.trim(),
        price: parseFloat(editForm.price),
      });
      setProducts((prev) => prev.map((p) => (p.id === id ? (updated as MenuItem) : p)));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update product:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteMenuItem(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Failed to delete product.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (p: MenuItem) => {
    setTogglingId(p.id);
    try {
      const updated = await toggleMenuItemAvailability(p.id, !(p.is_available ?? (p as any).isAvailable));
      setProducts((prev) => prev.map((x) => (x.id === p.id ? (updated as MenuItem) : x)));
    } catch {
      // non-fatal
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          >
            {filterOptions.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setAddError('');
            setAddForm({ ...EMPTY_FORM, category: allCats[0] || '' });
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors shrink-0"
        >
          <PlusIcon className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Category chips */}
      {allCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allCats.map((cat) => {
            const count = products.filter((p) => p.category === cat).length;
            const isCustomOnly = !productCats.includes(cat);
            return (
              <div
                key={cat}
                className="group flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300"
              >
                <span>{cat}</span>
                <span className="text-slate-500">({count})</span>
                {isCustomOnly && (
                  <button
                    onClick={() => {
                      setCustomCats((prev) => {
                        const next = prev.filter((c) => c !== cat);
                        saveCustomCategories(next);
                        return next;
                      });
                    }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                    title="Remove empty category"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5"
        >
          <p className="text-sm font-semibold text-slate-200 mb-4">New Product</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">Product Name *</label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Coca Cola 500ml"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category *</label>
              <CategorySelect
                value={addForm.category}
                onChange={(v) => setAddForm((p) => ({ ...p, category: v }))}
                categories={allCats}
                onNewCategory={addCustomCategory}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Price *</label>
              <input
                type="number"
                min="0"
                step="1"
                value={addForm.price}
                onChange={(e) => setAddForm((p) => ({ ...p, price: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>
          {addError && <p className="text-red-400 text-xs mt-3">{addError}</p>}
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={addSaving}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-sm font-semibold transition-colors"
            >
              {addSaving ? 'Saving…' : 'Add Product'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Product table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-slate-500">
          <p className="text-sm">No products found</p>
          {products.length === 0 && (
            <p className="text-xs mt-1">Click "Add Product" to add your first item</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4 text-right">Price</th>
                <th className="pb-2 pr-4 text-center">Available</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((p) => {
                const isAvailable = p.is_available ?? (p as any).isAvailable ?? true;
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id} className="group">
                    <td className="py-3 pr-4">
                      {isEditing ? (
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span className={`font-medium ${isAvailable ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                          {p.name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {isEditing ? (
                        <CategorySelect
                          value={editForm.category}
                          onChange={(v) => setEditForm((f) => ({ ...f, category: v }))}
                          categories={allCats}
                          onNewCategory={addCustomCategory}
                          small
                        />
                      ) : (
                        <span className="text-slate-400">{p.category}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editForm.price}
                          onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                          className="w-24 px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 text-right focus:outline-none"
                        />
                      ) : (
                        <span className="text-amber-400 font-semibold">{formatPrice(p.price)}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={togglingId === p.id}
                        className="inline-flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
                        title={isAvailable ? 'Mark unavailable' : 'Mark available'}
                      >
                        {isAvailable
                          ? <ToggleRightIcon className="w-6 h-6 text-emerald-400" />
                          : <ToggleLeftIcon className="w-6 h-6 text-slate-600" />}
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditSave(p.id)}
                            disabled={editSaving}
                            className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 transition-colors disabled:opacity-40"
                            title="Save"
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Cancel"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                            title="Edit"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-600">
        {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== products.length && ` (${products.length} total)`}
      </p>
    </div>
  );
}
