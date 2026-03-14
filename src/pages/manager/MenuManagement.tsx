import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon } from
'lucide-react';
import { MenuItem, MenuCategory, MenuCategoryInfo } from '../../types';
import {
  menuItems as initialMenuItems,
  menuCategories } from
'../../data/menuData';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { SearchBar } from '../../components/ui/SearchBar';
import { Badge } from '../../components/ui/Badge';
import { MenuItemEditor } from '../../components/manager/MenuItemEditor';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';
import { uploadMenu } from '../../api/menu';

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

export function MenuManagement() {
  // Use menu hook to get items from backend
  const { menuItems: backendMenuItems, isLoading, refetch } = useMenu();
  
  // Use backend items if available, otherwise fall back to initial
  const menuItemsState = backendMenuItems && backendMenuItems.length > 0 
    ? backendMenuItems 
    : initialMenuItems;
  
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Build categories from menu items + defaults
  // Build tabs from menu items + defaults
  const tabs: TabOption[] = React.useMemo(() => {
    const uniqueCategories = Array.from(new Set(menuItemsState.map(item => item.category)));
    // Start with 'All Items' tab
    const allTab: TabOption = { id: 'all', label: 'All Items', icon: '📋' };
    // Add categories from default that exist in menu
    const categoryTabs = defaultCategories
      .filter(c => uniqueCategories.includes(c.id))
      .map(c => ({
        id: c.id,
        label: c.name,
        icon: c.emoji
      }));
    return [allTab, ...categoryTabs];
  }, [menuItemsState]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading menu...</div>
      </div>
    );
  }

  const filteredItems = useMemo(() => {
    let items =
    activeCategory === 'all' ?
    menuItemsState :
    menuItemsState.filter((item) => item.category === activeCategory);
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
        isPopular: itemData.isPopular ?? false
      };
      updatedItems = [newItem, ...menuItemsState];
    }
    
    // Save to backend
    setIsSaving(true);
    try {
      await uploadMenu(updatedItems);
      refetch(); // Reload from backend
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
    setIsSaving(true);
    try {
      await uploadMenu(updatedItems);
      refetch();
    } catch (err) {
      console.error('Failed to update item:', err);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeleteItem = async (itemId: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      const updatedItems = menuItemsState.filter((item) => item.id !== itemId);
      
      // Save to backend
      setIsSaving(true);
      try {
        await uploadMenu(updatedItems);
        refetch();
      } catch (err) {
        console.error('Failed to delete item:', err);
      } finally {
        setIsSaving(false);
      }
    }
  };
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Menu Management</h1>
            <p className="text-slate-400">
              {menuItemsState.length} items total
            </p>
          </div>
          <Button variant="primary" onClick={handleAddItem}>
            <PlusIcon className="w-5 h-5" />
            Add Item
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search menu items..."
            className="md:w-80" />

          <div className="flex-1 overflow-x-auto">
            <Tabs
              tabs={tabs}
              activeTab={activeCategory}
              onTabChange={setActiveCategory}
              variant="pills" />

          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              transition={{
                delay: index * 0.02
              }}>

                <Card
                className={`bg-slate-800 ${!item.isAvailable ? 'opacity-60' : ''}`}>

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{item.emoji}</span>
                      <div>
                        <h3 className="font-semibold text-white">
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

                  <div className="flex items-center justify-between text-sm text-slate-400 mb-4">
                    <span>
                      {defaultCategories.find((c) => c.id === item.category)?.name || item.category}
                    </span>
                    <span>{item.prepTime} min prep</span>
                  </div>

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
          categories={defaultCategories.filter(c => c.id !== 'all')}
          onAddCategory={(cat) => {
            // Categories are now auto-detected from menu items
            console.log('Category added:', cat);
          }}
        />

      </div>
    </div>);

}