import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  UploadIcon,
  DownloadIcon,
  FileSpreadsheetIcon } from
'lucide-react';
import { MenuItem, MenuCategoryInfo } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { SearchBar } from '../../components/ui/SearchBar';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { MenuItemEditor } from '../../components/manager/MenuItemEditor';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';
import { exportMenuToCsv, exportMenuToJson, importMenuFromFile, saveCustomMenu, downloadMenuTemplate } from '../../utils/menuImportExport';
import { fetchInventory, updateInventoryRecord as apiUpdateInventoryRecord } from '../../api/inventory';
import { deleteMenuItem as apiDeleteMenuItem } from '../../api/menu';

// Default categories with emojis from dummy data
const defaultCategories: MenuCategoryInfo[] = [
  { id: 'alcoholic-drinks', name: 'Alcoholic Drinks', emoji: '🍸' },
  { id: 'beers', name: 'Beers', emoji: '🍺' },
  { id: 'wine', name: 'Wine', emoji: '🍷' },
  { id: 'soft-drinks', name: 'Soft Drinks', emoji: '🥤' },
  { id: 'breakfast', name: 'Breakfast', emoji: '🍳' },
  { id: 'lunch', name: 'Lunch', emoji: '🥗' },
  { id: 'dinner', name: 'Dinner', emoji: '🍽️' },
  { id: 'desserts', name: 'Desserts', emoji: '🍰' },
  { id: 'snacks', name: 'Snacks', emoji: '🥨' },
];

// Tab type with optional emoji icon
interface TabOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

const slugifyCategory = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const titleCaseCategory = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function MenuManagement() {
  // Use menu hook to get items from backend
  const {
    menuItems: backendMenuItems,
    isLoading,
    error: menuError,
    refresh,
    saveMenu
  } = useMenu();

  // Use backend items if available, otherwise fall back to initial
  const menuItemsState = useMemo(() => backendMenuItems || [], [backendMenuItems]);
  
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [customCategories, setCustomCategories] = useState<MenuCategoryInfo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportButtonRef = useRef<HTMLDivElement>(null);

  // ── Inventory tracking ──────────────────────────────────────────────────────
  type InvEntry = { stock: number; threshold: number };
  const [invMap, setInvMap] = useState<Record<string, InvEntry>>({});
  const [trackingItem, setTrackingItem] = useState<MenuItem | null>(null);
  const [trackStock, setTrackStock] = useState(0);
  const [trackThreshold, setTrackThreshold] = useState(5);
  const [trackUnitCost, setTrackUnitCost] = useState(0);
  const [trackLocation, setTrackLocation] = useState('');
  const [isSavingTrack, setIsSavingTrack] = useState(false);

  const loadInvMap = useCallback(async () => {
    const records = await fetchInventory();
    const map: Record<string, InvEntry> = {};
    records.forEach((r) => {
      map[r.menuItemId] = { stock: r.stock, threshold: r.lowStockThreshold };
    });
    setInvMap(map);
  }, []);

  useEffect(() => { loadInvMap(); }, [loadInvMap]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) loadInvMap(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadInvMap]);

  const handleOpenTrack = (item: MenuItem) => {
    const existing = invMap[item.id];
    setTrackStock(existing?.stock ?? 0);
    setTrackThreshold(existing?.threshold ?? 5);
    setTrackUnitCost(0);
    setTrackLocation('');
    setTrackingItem(item);
  };

  const handleSaveTrack = async () => {
    if (!trackingItem) return;
    setIsSavingTrack(true);
    try {
      await apiUpdateInventoryRecord(trackingItem.id, {
        stock: trackStock,
        lowStockThreshold: trackThreshold,
        unitCost: trackUnitCost,
        location: trackLocation,
        reorderPoint: Math.max(1, Math.floor(trackThreshold * 1.5)),
        reorderQty: Math.max(1, trackThreshold * 4),
      });
      await Promise.all([loadInvMap(), refresh()]);
      setTrackingItem(null);
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingTrack(false);
    }
  };

  // Close export dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportButtonRef.current &&
        !exportButtonRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest('.export-dropdown')
      ) {
        setIsExportMenuOpen(false);
      }
    };

    if (isExportMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isExportMenuOpen]);
  const categoryOptions = useMemo(() => {
    const defaultById = new Map(defaultCategories.map((c) => [c.id, c]));
    const map = new Map<string, MenuCategoryInfo>();

    defaultCategories.forEach((c) => map.set(c.id, c));

    menuItemsState.forEach((item) => {
      const raw = String(item.category || '').trim();
      if (!raw) return;
      const normalized = slugifyCategory(raw);
      const fromDefault = defaultById.get(normalized as MenuCategoryInfo['id']);
      if (fromDefault) {
        map.set(fromDefault.id, fromDefault);
        return;
      }
      map.set(normalized, {
        id: normalized,
        name: titleCaseCategory(raw),
        emoji: item.emoji || '🍽️',
      });
    });

    customCategories.forEach((c) => {
      const normalizedId = slugifyCategory(c.id);
      map.set(normalizedId, {
        id: normalizedId,
        name: c.name || titleCaseCategory(normalizedId),
        emoji: c.emoji || '🍽️',
      });
    });

    return Array.from(map.values());
  }, [menuItemsState, customCategories]);

  // Build tabs from menu items + defaults + custom
  const tabs: TabOption[] = useMemo(() => {
    const categorySet = new Set(
      menuItemsState
        .map((item) => slugifyCategory(item.category))
        .filter(Boolean)
    );
    // Start with 'All Items' tab
    const allTab: TabOption = { id: 'all', label: 'All Items' };
    const categoryTabs = categoryOptions
      .filter((c) => categorySet.has(c.id))
      .map((c) => ({
        id: c.id,
        label: c.name,
        icon: c.emoji
      }));
    return [allTab, ...categoryTabs];
  }, [menuItemsState, categoryOptions]);

  const filteredItems = useMemo(() => {
    let items =
    activeCategory === 'all' ?
    menuItemsState :
    menuItemsState.filter((item) => slugifyCategory(item.category) === activeCategory);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }
    return items;
  }, [menuItemsState, activeCategory, searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading menu...</div>
      </div>
    );
  }

  if (menuError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-700/30 border border-red-500/40 p-6 rounded-lg max-w-xl text-center">
          <p className="text-red-300 mb-2 text-lg font-semibold">Unable to load menu</p>
          <p className="text-red-200 mb-4">{menuError}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 rounded-md bg-amber-500 text-slate-900 font-semibold hover:bg-amber-400"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  const handleAddItem = () => {
    setEditingItem(null);
    setIsEditorOpen(true);
  };
  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setIsEditorOpen(true);
  };
  const handleSaveItem = async (itemData: Partial<MenuItem>) => {
    let updatedItems: MenuItem[];
    
    if (editingItem) {
      updatedItems = menuItemsState.map((item) =>
        item.id === editingItem.id ?
        {
          ...item,
          ...itemData
        } :
        item
      );
    } else {
      const newItem: MenuItem = {
        id: `item-${Date.now()}`,
        name: itemData.name || '',
        description: itemData.description || '',
        price: itemData.price || 0,
        category: itemData.category || 'lunch',
        emoji: itemData.emoji || '🍽️',
        prepTime: itemData.prepTime || 15,
        isAvailable: itemData.isAvailable ?? true,
        isPopular: itemData.isPopular ?? false,
        requiresKitchen: itemData.requiresKitchen ?? true,
      };
      updatedItems = [newItem, ...menuItemsState];
    }
    
    // Save locally then sync backend
    saveCustomMenu(updatedItems);
    setIsSaving(true);
    try {
      await saveMenu(updatedItems);
      await refresh();
    } catch (err) {
      console.error('Failed to save menu:', err);
    } finally {
      setIsSaving(false);
    }
  };
  const handleToggleAvailability = async (itemId: string) => {
    const updatedItems = menuItemsState.map((item) =>
      item.id === itemId ?
      {
        ...item,
        isAvailable: !item.isAvailable
      } :
      item
    );
    
    // Save to backend
    saveCustomMenu(updatedItems);
    setIsSaving(true);
    try {
      await saveMenu(updatedItems);
      await refresh();
    } catch (err) {
      console.error('Failed to update item:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const performDeleteItems = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    const updatedItems = menuItemsState.filter((item) => !itemIds.includes(item.id));
    saveCustomMenu(updatedItems);
    setIsSaving(true);

    try {
      const results = await Promise.allSettled(itemIds.map((id) => apiDeleteMenuItem(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      await refresh();

      if (failed > 0) {
        alert(`${itemIds.length - failed} item(s) deleted, ${failed} failed.`);
      }
    } catch (err) {
      console.error('Failed to delete menu item(s):', err);
    } finally {
      setIsSaving(false);
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        itemIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };
  
  const handleDeleteItem = async (itemId: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      await performDeleteItems([itemId]);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedItemIds);
    if (ids.length === 0) return;

    if (!confirm(`Delete ${ids.length} selected menu item(s)? This cannot be undone.`)) {
      return;
    }

    await performDeleteItems(ids);
  };

  const handleDeleteAllVisible = async () => {
    const ids = filteredItems.map((item) => item.id);
    if (ids.length === 0) return;

    if (!confirm(`Delete all ${ids.length} visible menu item(s)? This cannot be undone.`)) {
      return;
    }

    await performDeleteItems(ids);
  };

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.has(item.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((item) => next.delete(item.id));
        return next;
      });
      return;
    }

    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const handleExportJson = () => {
    exportMenuToJson(menuItemsState);
    setIsExportMenuOpen(false);
  };

  const handleExportCsv = () => {
    exportMenuToCsv(menuItemsState);
    setIsExportMenuOpen(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const importedItems = await importMenuFromFile(file);
      await saveMenu(importedItems);
      await refresh();
      alert(`Successfully imported ${importedItems.length} menu items!`);
    } catch (err) {
      console.error('Failed to import menu:', err);
      alert('Failed to import menu. Please check the file format.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  return (
    <div className="dark min-h-screen bg-slate-900 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100">Menu Management</h1>
            <p className="text-slate-400">
              {menuItemsState.length} items total
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Template Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadMenuTemplate}
            >
              <FileSpreadsheetIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Template</span>
            </Button>
            {/* Import Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImportClick}
              isLoading={isImporting}
            >
              <UploadIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileChange}
              className="hidden"
            />
            {/* Export Dropdown */}
            <div className="relative export-dropdown" ref={exportButtonRef}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              >
                <DownloadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              {isExportMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-md shadow-lg border border-slate-700 z-50">
                  <button
                    onClick={handleExportJson}
                    className="w-full px-4 py-2 text-left text-gray-200 hover:bg-slate-700 flex items-center gap-2"
                  >
                    <FileSpreadsheetIcon className="w-4 h-4" />
                    Export as JSON
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full px-4 py-2 text-left text-gray-200 hover:bg-slate-700 flex items-center gap-2"
                  >
                    <FileSpreadsheetIcon className="w-4 h-4" />
                    Export as CSV
                  </button>
                </div>
              )}
            </div>
            <Button variant="primary" size="sm" onClick={handleAddItem} isLoading={isSaving}>
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Add Item</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search menu items..."
            className="sm:w-80" />

          <div className="flex-1 overflow-x-auto">
            <Tabs
              tabs={tabs}
              activeTab={activeCategory}
              onTabChange={setActiveCategory}
              variant="pills" />

          </div>
        </div>

        {/* Menu Items Grid */}
        {selectedItemIds.size > 0 && (
          <div className="mb-4 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 flex flex-wrap items-center gap-2">
            <span className="text-sm text-red-200 font-medium">{selectedItemIds.size} selected</span>
            <Button variant="danger" size="sm" onClick={handleDeleteSelected} isLoading={isSaving}>
              <TrashIcon className="w-4 h-4" />
              Delete Selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedItemIds(new Set())}
              className="text-slate-300"
            >
              Clear
            </Button>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <input
            id="menu-select-all"
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleSelectAllFiltered}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-amber-500"
          />
          <label htmlFor="menu-select-all" className="text-xs text-slate-400">
            Select all visible ({filteredItems.length})
          </label>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDeleteAllVisible}
            isLoading={isSaving}
            className="ml-auto"
            disabled={filteredItems.length === 0}
          >
            <TrashIcon className="w-4 h-4" />
            Delete All Visible
          </Button>
        </div>

        <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, index) =>
            <motion.div
              key={item.id}
              layout
              initial={{
                opacity: 0,
                scale: 0.9
              }}
              animate={{
                opacity: 1,
                scale: 1
              }}
              exit={{
                opacity: 0,
                scale: 0.9
              }}
              className="h-full"
              transition={{
                delay: index * 0.02
              }}>

                <Card
                className={`bg-slate-800 h-full flex flex-col ${!item.isAvailable ? 'opacity-60' : ''}`}>

                  <div className="mb-2">
                    <input
                      aria-label={`Select ${item.name}`}
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={(e) => {
                        setSelectedItemIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        });
                      }}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-amber-500"
                    />
                  </div>

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{item.emoji}</span>
                      <div>
                        <h3 className="font-semibold text-gray-100">
                          {item.name}
                        </h3>
                        <p className="text-lg font-bold text-amber-400">
                          {formatPrice(item.price)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {item.isPopular &&
                    <Badge variant="pending" size="sm">
                          Popular
                        </Badge>
                    }
                      {!item.isAvailable &&
                    <Badge variant="cancelled" size="sm">
                          Unavailable
                        </Badge>
                    }
                    </div>
                  </div>

                  <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                    {item.description}
                  </p>

                  <div className="flex items-center justify-between text-sm text-slate-400 mb-3">
                    <span>
                      {categoryOptions.find((c) => c.id === slugifyCategory(item.category))?.name || item.category}
                    </span>
                    <span>{item.prepTime} min prep</span>
                  </div>

                  {/* Stock indicator */}
                  {invMap[item.id] ? (
                    <button
                      onClick={() => handleOpenTrack(item)}
                      className={`w-full flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md mb-3 border transition-colors ${
                        invMap[item.id].stock === 0
                          ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                          : invMap[item.id].stock <= invMap[item.id].threshold
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      <span>
                        {invMap[item.id].stock === 0
                          ? '● Out of stock'
                          : invMap[item.id].stock <= invMap[item.id].threshold
                          ? '● Low stock'
                          : '● In stock'}
                      </span>
                      <span className="font-semibold">{invMap[item.id].stock} units</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenTrack(item)}
                      className="w-full text-xs text-slate-500 border border-dashed border-slate-600 rounded-md px-2.5 py-1.5 mb-3 hover:border-amber-500/60 hover:text-amber-400 transition-colors text-left"
                    >
                      + Track stock
                    </button>
                  )}

                  <div className="flex gap-2">
                    <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleAvailability(item.id)}
                    className="flex-1">

                      {item.isAvailable ?
                    <>
                          <EyeOffIcon className="w-4 h-4" />
                          Hide
                        </> :

                    <>
                          <EyeIcon className="w-4 h-4" />
                          Show
                        </>
                    }
                    </Button>
                    <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEditItem(item)}>

                      <EditIcon className="w-4 h-4" />
                    </Button>
                    <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteItem(item.id)}>

                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {filteredItems.length === 0 &&
        <div className="text-center py-12">
            <span className="text-4xl block mb-3">🔍</span>
            <p className="text-slate-400">No items found</p>
          </div>
        }

        {/* Editor Modal */}
        <MenuItemEditor
          item={editingItem}
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSaveItem}
          categories={categoryOptions}
          onAddCategory={(category) => {
            const normalizedId = slugifyCategory(category.id);
            if (!normalizedId) return;
            setCustomCategories((prev) => {
              if (prev.some((c) => slugifyCategory(c.id) === normalizedId)) return prev;
              return [
                ...prev,
                {
                  id: normalizedId,
                  name: category.name || titleCaseCategory(normalizedId),
                  emoji: category.emoji || '🍽️',
                },
              ];
            });
          }}
        />

        {/* Track Stock Modal */}
        <Modal
          isOpen={!!trackingItem}
          onClose={() => setTrackingItem(null)}
          title={`${invMap[trackingItem?.id ?? ''] ? 'Update Stock' : 'Enable Stock Tracking'} — ${trackingItem?.name ?? ''}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Stock will automatically decrease each time an order containing{' '}
              <span className="text-slate-200 font-medium">{trackingItem?.name}</span> is placed.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-300">
                Current stock
                <input
                  type="number"
                  min={0}
                  value={trackStock}
                  onChange={(e) => setTrackStock(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Low-stock alert below
                <input
                  type="number"
                  min={0}
                  value={trackThreshold}
                  onChange={(e) => setTrackThreshold(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Unit cost (RWF)
                <input
                  type="number"
                  min={0}
                  value={trackUnitCost}
                  onChange={(e) => setTrackUnitCost(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Storage location
                <input
                  type="text"
                  value={trackLocation}
                  onChange={(e) => setTrackLocation(e.target.value)}
                  placeholder="e.g. Bar Fridge"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p>● Every order placed will deduct from this stock level in real time.</p>
              <p>● An alert fires when stock drops to or below the low-stock threshold.</p>
              <p>● You can adjust stock manually anytime from the Inventory page.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setTrackingItem(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveTrack} isLoading={isSavingTrack}>
                {invMap[trackingItem?.id ?? ''] ? 'Update Stock' : 'Enable Tracking'}
              </Button>
            </div>
          </div>
        </Modal>

      </div>
    </div>
  );
}
