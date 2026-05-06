import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  PlusIcon, EditIcon, TrashIcon, RefreshCwIcon,
  CheckIcon, XIcon, SearchIcon, ToggleLeftIcon, ToggleRightIcon,
  DownloadIcon, UploadIcon, FileSpreadsheetIcon,
  TagIcon, PackageIcon, CheckCircleIcon, XCircleIcon,
  ArrowUpDownIcon,
} from 'lucide-react';
import {
  fetchMenu, createMenuItem, updateMenuItem,
  deleteMenuItem, toggleMenuItemAvailability, generateSku,
} from '../../api/menu';
import { formatPrice } from '../../utils/currency';
import {
  exportProductsToCsv,
  downloadProductTemplate,
  importProductsFromFile,
  type ProductImportRow,
} from '../../utils/minimartProductImportExport';
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

// â”€â”€ CategorySelect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CategorySelectProps {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
  onNewCategory: (v: string) => void;
  className?: string;
  small?: boolean;
}

function CategorySelect({ value, onChange, categories, onNewCategory, className = '', small }: CategorySelectProps) {
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (addingNew) inputRef.current?.focus(); }, [addingNew]);

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
          placeholder="Category nameâ€¦"
          className={`flex-1 min-w-0 ${baseInput}`}
        />
        <button type="button" onClick={commitNew} className="shrink-0 p-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 transition-colors" title="Confirm">
          <CheckIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={cancelNew} className="shrink-0 p-1.5 rounded bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors" title="Cancel">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => { if (e.target.value === '__new__') setAddingNew(true); else onChange(e.target.value); }}
      className={`${small ? 'px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 focus:outline-none' : 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500'} ${className}`}
    >
      {categories.length === 0 && <option value="" disabled>Select or add category</option>}
      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value="__new__">ï¼‹ New categoryâ€¦</option>
    </select>
  );
}

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ProductForm {
  name: string;
  sku: string;
  category: string;
  price: string;
  emoji: string;
  description: string;
}

type SortField = 'name' | 'category' | 'price' | 'available';
type SortDir   = 'asc' | 'desc';

const EMPTY_FORM: ProductForm = { name: '', sku: '', category: '', price: '', emoji: '📦', description: '' };

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function MinimartProductManagement() {
  const [products, setProducts]             = useState<MenuItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAvailability, setFilterAvailability] = useState<'all' | 'active' | 'inactive'>('all');
  const [customCats, setCustomCats]         = useState<string[]>(loadCustomCategories);
  const [sortField, setSortField]           = useState<SortField>('name');
  const [sortDir, setSortDir]               = useState<SortDir>('asc');

  // Add form
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState<ProductForm>(EMPTY_FORM);
  const [addError, setAddError]   = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<ProductForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [togglingId, setTogglingId]   = useState<string | null>(null);

  // Bulk actions
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  // Import
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

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

  const productCats = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);
  const allCats     = useMemo(() => Array.from(new Set([...productCats, ...customCats])).sort(), [productCats, customCats]);
  const filterOptions = useMemo(() => ['all', ...allCats], [allCats]);

  const stats = useMemo(() => {
    const total    = products.length;
    const active   = products.filter((p) => p.is_available !== false).length;
    const inactive = total - active;
    return { total, active, inactive, categories: allCats.length };
  }, [products, allCats]);

  const addCustomCategory = (name: string) => {
    setCustomCats((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name].sort();
      saveCustomCategories(next);
      return next;
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchCat  = filterCategory === 'all' || p.category === filterCategory;
      const matchAvail = filterAvailability === 'all' ||
        (filterAvailability === 'active' && p.is_available !== false) ||
        (filterAvailability === 'inactive' && p.is_available === false);
      const matchSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(search.toLowerCase());
      return matchCat && matchAvail && matchSearch;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name')      cmp = a.name.localeCompare(b.name);
      else if (sortField === 'category') cmp = a.category.localeCompare(b.category);
      else if (sortField === 'price')    cmp = a.price - b.price;
      else if (sortField === 'available') cmp = Number(b.is_available) - Number(a.is_available);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [products, search, filterCategory, filterAvailability, sortField, sortDir]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((p) => next.delete(p.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((p) => next.add(p.id)); return next; });
    }
  };

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
    setAddSaving(true); setAddError('');
    try {
      const created = await createMenuItem({
        name:             addForm.name.trim(),
        sku:              addForm.sku.trim() || undefined,
        category:         addForm.category.trim(),
        price:            parseFloat(addForm.price),
        emoji:            addForm.emoji || '📦',
        description:      addForm.description.trim(),
        prep_time:        0,
        requires_kitchen: false,
        is_available:     true,
        is_popular:       false,
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
    setEditForm({
      name:        p.name,
      sku:         p.sku || '',
      category:    p.category,
      price:       String(p.price),
      emoji:       (p as any).emoji || '📦',
      description: p.description || '',
    });
  };

  const handleEditSave = async (id: string) => {
    const err = validateForm(editForm);
    if (err) return;
    setEditSaving(true);
    try {
      const updated = await updateMenuItem(id, {
        name:        editForm.name.trim(),
        sku:         editForm.sku.trim() || undefined,
        category:    editForm.category.trim(),
        price:       parseFloat(editForm.price),
        emoji:       editForm.emoji || '📦',
        description: editForm.description.trim(),
      } as any);
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
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch { alert('Failed to delete product.'); }
    finally { setDeletingId(null); }
  };

  const handleToggle = async (p: MenuItem) => {
    setTogglingId(p.id);
    try {
      const updated = await toggleMenuItemAvailability(p.id, !(p.is_available ?? (p as any).isAvailable));
      setProducts((prev) => prev.map((x) => (x.id === p.id ? (updated as MenuItem) : x)));
    } catch { /* non-fatal */ }
    finally { setTogglingId(null); }
  };

  const handleBulkEnable = async (enable: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkWorking(true);
    try {
      await Promise.all(ids.map((id) => {
        const p = products.find((x) => x.id === id);
        if (!p) return Promise.resolve();
        const cur = p.is_available ?? (p as any).isAvailable ?? true;
        if (cur === enable) return Promise.resolve();
        return toggleMenuItemAvailability(id, enable).then((updated) => {
          setProducts((prev) => prev.map((x) => (x.id === id ? (updated as MenuItem) : x)));
        });
      }));
      setSelected(new Set());
    } finally { setBulkWorking(false); }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} product${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkWorking(true);
    try {
      await Promise.all(ids.map((id) => deleteMenuItem(id).catch(() => {})));
      setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelected(new Set());
    } finally { setBulkWorking(false); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportError(''); setImportResult(null);
    try {
      const rows: ProductImportRow[] = await importProductsFromFile(file);
      const existingNames = new Set(products.map((p) => p.name.toLowerCase().trim()));
      let added = 0; let skipped = 0;
      for (const row of rows) {
        if (existingNames.has(row.name.toLowerCase())) { skipped++; continue; }
        const created = await createMenuItem({
          name:             row.name,
          category:         row.category,
          price:            row.price,
          emoji:            row.emoji,
          description:      row.description,
          prep_time:        0,
          requires_kitchen: false,
          is_available:     row.isAvailable,
          is_popular:       false,
        } as any);
        setProducts((prev) => [...prev, created as MenuItem]);
        existingNames.add(row.name.toLowerCase());
        added++;
      }
      setImportResult({ added, skipped });
    } catch (err: any) {
      setImportError(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 hover:text-slate-200 transition-colors group"
    >
      {label}
      <ArrowUpDownIcon className={`w-3 h-3 ${sortField === field ? 'text-amber-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
    </button>
  );

  return (
    <div className="space-y-5">
      {/* â”€â”€ Stats strip â”€â”€ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Products', value: stats.total, icon: <PackageIcon className="w-4 h-4 text-blue-400" />, color: 'text-blue-400' },
          { label: 'Active',         value: stats.active, icon: <CheckCircleIcon className="w-4 h-4 text-emerald-400" />, color: 'text-emerald-400' },
          { label: 'Inactive',       value: stats.inactive, icon: <XCircleIcon className="w-4 h-4 text-red-400" />, color: 'text-red-400' },
          { label: 'Categories',     value: stats.categories, icon: <TagIcon className="w-4 h-4 text-amber-400" />, color: 'text-amber-400' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-800">{kpi.icon}</div>
            <div>
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* â”€â”€ Toolbar â”€â”€ */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap flex-1 min-w-0">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search productsâ€¦"
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          >
            {filterOptions.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
            ))}
          </select>
          {/* Availability filter */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterAvailability(f)}
                className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${
                  filterAvailability === f ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={load}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Template */}
          <button
            onClick={downloadProductTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm transition-colors"
            title="Download CSV template"
          >
            <FileSpreadsheetIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Template</span>
          </button>
          {/* Import */}
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm transition-colors disabled:opacity-50"
          >
            <UploadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{importing ? 'Importingâ€¦' : 'Import'}</span>
          </button>
          <input ref={importRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          {/* Export */}
          <button
            onClick={() => exportProductsToCsv(products)}
            disabled={products.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm transition-colors disabled:opacity-40"
          >
            <DownloadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {/* Add Product */}
          <button
            onClick={() => { setShowAdd((v) => !v); setAddError(''); setAddForm({ ...EMPTY_FORM, category: allCats[0] || '' }); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors"
          >
            <PlusIcon className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importResult && (
        <div className="flex items-center justify-between bg-emerald-900/30 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm">
          <p className="text-emerald-300">
            âœ“ Imported <span className="font-semibold">{importResult.added}</span> product{importResult.added !== 1 ? 's' : ''}.
            {importResult.skipped > 0 && ` ${importResult.skipped} skipped (name already exists).`}
          </p>
          <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-200">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {importError && (
        <div className="flex items-center justify-between bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-sm">
          <p className="text-red-300">{importError}</p>
          <button onClick={() => setImportError('')} className="text-slate-400 hover:text-slate-200">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* â”€â”€ Category chips â”€â”€ */}
      {allCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allCats.map((cat) => {
            const count = products.filter((p) => p.category === cat).length;
            const isCustomOnly = !productCats.includes(cat);
            return (
              <div key={cat} className="group flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
                <span>{cat}</span>
                <span className="text-slate-500">({count})</span>
                {isCustomOnly && (
                  <button
                    onClick={() => setCustomCats((prev) => { const next = prev.filter((c) => c !== cat); saveCustomCategories(next); return next; })}
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

      {/* â”€â”€ Add form â”€â”€ */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <PlusIcon className="w-4 h-4 text-amber-400" /> New Product
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
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
              <CategorySelect value={addForm.category} onChange={(v) => setAddForm((p) => ({ ...p, category: v }))} categories={allCats} onNewCategory={addCustomCategory} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Price (RWF) *</label>
              <input
                type="number" min="0" step="0.01" value={addForm.price}
                onChange={(e) => setAddForm((p) => ({ ...p, price: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <input
                value={addForm.description}
                onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional short descriptionâ€¦"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Item Code (SKU)</label>
              <div className="flex gap-1">
                <input
                  value={addForm.sku}
                  onChange={(e) => setAddForm((p) => ({ ...p, sku: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                  placeholder="e.g. COCAC01"
                  maxLength={10}
                  className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                {addForm.name && (
                  <button
                    type="button"
                    onClick={() => setAddForm((p) => ({ ...p, sku: generateSku(p.name, products.length + 1) }))}
                    className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 text-xs transition-colors"
                    title="Auto-generate SKU from name"
                  >
                    Auto
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-600 mt-1">Leave blank to auto-generate</p>
            </div>
          </div>
          {addError && <p className="text-red-400 text-xs mt-3">{addError}</p>}
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={addSaving} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-sm font-semibold transition-colors">
              {addSaving ? 'Savingâ€¦' : 'Add Product'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* â”€â”€ Bulk action bar â”€â”€ */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-sm text-amber-300 font-medium">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => handleBulkEnable(true)}
              disabled={bulkWorking}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <ToggleRightIcon className="w-4 h-4" /> Enable
            </button>
            <button
              onClick={() => handleBulkEnable(false)}
              disabled={bulkWorking}
              className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <ToggleLeftIcon className="w-4 h-4" /> Disable
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkWorking}
              className="px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <TrashIcon className="w-4 h-4" /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* â”€â”€ Table â”€â”€ */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" /> Loadingâ€¦
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <PackageIcon className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">No products found</p>
          {products.length === 0 && <p className="text-xs mt-1 text-slate-600">Click "Add Product" to add your first item</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                </th>
                <th className="px-4 py-3"><SortBtn field="name" label="Product" /></th>
                <th className="px-4 py-3 hidden sm:table-cell"><SortBtn field="category" label="Category" /></th>
                <th className="px-4 py-3 text-right"><SortBtn field="price" label="Price" /></th>
                <th className="px-4 py-3 text-center hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-center"><SortBtn field="available" label="Status" /></th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((p) => {
                const isAvailable = p.is_available !== false;
                const isEditing   = editingId === p.id;
                const isSelected  = selected.has(p.id);
                return (
                  <tr
                    key={p.id}
                    className={`group transition-colors ${isSelected ? 'bg-amber-500/5' : 'hover:bg-slate-800/40'}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => setSelected((prev) => {
                          const next = new Set(prev);
                          isSelected ? next.delete(p.id) : next.add(p.id);
                          return next;
                        })}
                        className="accent-amber-500 w-4 h-4"
                      />
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 focus:outline-none"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <input
                              value={editForm.sku}
                              onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                              placeholder="SKU"
                              maxLength={10}
                              className="flex-1 min-w-0 px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-xs text-slate-300 focus:outline-none focus:border-amber-500 font-mono"
                            />
                            {editForm.name && (
                              <button
                                type="button"
                                onClick={() => setEditForm((f) => ({ ...f, sku: generateSku(f.name, products.length + 1) }))}
                                className="shrink-0 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 text-[10px] transition-colors"
                              >
                                Auto
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className={`font-medium ${isAvailable ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                            {p.name}
                          </span>
                          {p.sku && (
                            <span className="block text-[10px] font-mono text-amber-500/60 mt-0.5 tracking-wide">
                              {p.sku}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Category */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {isEditing ? (
                        <CategorySelect value={editForm.category} onChange={(v) => setEditForm((f) => ({ ...f, category: v }))} categories={allCats} onNewCategory={addCustomCategory} small />
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs">{p.category}</span>
                      )}
                    </td>
                    {/* Price */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number" min="0" step="0.01" value={editForm.price}
                          onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                          className="w-24 px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 text-right focus:outline-none"
                        />
                      ) : (
                        <span className="text-amber-400 font-semibold tabular-nums">{formatPrice(p.price)}</span>
                      )}
                    </td>
                    {/* Description */}
                    <td className="px-4 py-3 hidden md:table-cell max-w-[200px]">
                      {isEditing ? (
                        <input
                          value={editForm.description}
                          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                          className="w-full px-2 py-1 bg-slate-800 border border-amber-500 rounded text-sm text-slate-100 focus:outline-none"
                          placeholder="Descriptionâ€¦"
                        />
                      ) : (
                        <span className="text-xs text-slate-500 truncate block">{p.description || 'â€”'}</span>
                      )}
                    </td>
                    {/* Available toggle */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={togglingId === p.id}
                        className="inline-flex items-center justify-center transition-colors disabled:opacity-40"
                        title={isAvailable ? 'Mark unavailable' : 'Mark available'}
                      >
                        {isAvailable
                          ? <ToggleRightIcon className="w-6 h-6 text-emerald-400" />
                          : <ToggleLeftIcon className="w-6 h-6 text-slate-600" />}
                      </button>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleEditSave(p.id)} disabled={editSaving} className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 transition-colors disabled:opacity-40" title="Save">
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors" title="Cancel">
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors" title="Edit">
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40" title="Delete">
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
        {filtered.length !== products.length && ` of ${products.length} total`}
        {selected.size > 0 && ` · ${selected.size} selected`}
      </p>
    </div>
  );
}

