import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SearchIcon,
  SparklesIcon,
  XIcon,
  MinusIcon,
  PlusIcon,
  ClockIcon,
  RefreshCwIcon
} from
'lucide-react';
import { MenuItem, MenuCategory, CartItem } from '../../types';
import { useMenu } from '../../hooks/useMenu';
import { MenuItemCard } from '../../components/customer/MenuItemCard';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';

interface MenuPageProps {
  onAddToCart: (item: MenuItem, quantity: number) => void;
}

const categoryNames: Record<string, string> = {
  'all': 'All',
  'alcoholic-drinks': '🍸 Alcoholic',
  'beers': '🍺 Beers',
  'wine': '🍷 Wine',
  'soft-drinks': '🥤 Drinks',
  'breakfast': '🍳 Breakfast',
  'lunch': '🥗 Lunch',
  'dinner': '🍽️ Dinner',
  'desserts': '🍰 Desserts',
  'snacks': '🥨 Snacks'
};

export function MenuPage({ onAddToCart }: MenuPageProps) {
  const { menuItems, categories, isLoading, error, refetch } = useMenu();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Get popular items from the fetched menu
  const popularItems = useMemo(() => 
    menuItems.filter((item) => item.isPopular).slice(0, 6),
    [menuItems]
  );

  const filteredItems = useMemo(() => {
    let items =
    activeCategory === 'all' ?
    menuItems :
    menuItems.filter((item) => item.category === activeCategory);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }
    return items;
  }, [activeCategory, searchQuery, menuItems]);

  const handleAddToCart = (item: MenuItem) => {
    onAddToCart(item, 1);
  };

  const handleViewDetails = (item: MenuItem) => {
    setSelectedItem(item);
    setQuantity(1);
  };

  const handleAddFromModal = () => {
    if (selectedItem) {
      onAddToCart(selectedItem, quantity);
      setSelectedItem(null);
      setQuantity(1);
    }
  };

  // Build categories from fetched menu
  const menuCategories = categories.map(cat => ({
    id: cat,
    name: categoryNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1),
    emoji: '🍽️'
  }));

  const categoryTabs = [
    { id: 'all', name: 'All', emoji: '🍽️' },
    ...menuCategories
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-2xl font-bold text-white">Menu</h1>
            {error && (
              <button 
                onClick={refetch}
                className="p-1.5 rounded-full bg-amber-500/20 text-amber-400"
                title="Reload menu"
              >
                <RefreshCwIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {categoryTabs.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                activeCategory === category.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span>{category.emoji}</span>
              <span className="text-sm font-medium">{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Popular Items */}
      {!isLoading && activeCategory === 'all' && searchQuery === '' && popularItems.length > 0 && (
        <div className="px-4 py-6">
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Popular</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {popularItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToCart={handleAddToCart}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Items */}
      {!isLoading && (
        <div className="px-4 py-4">
          <h2 className="text-lg font-semibold text-white mb-4">
            {activeCategory === 'all' ? 'Full Menu' : categoryNames[activeCategory] || activeCategory}
            <span className="text-slate-400 text-sm font-normal ml-2">
              ({filteredItems.length} items)
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToCart={handleAddToCart}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
          
          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p>No items found</p>
            </div>
          )}
        </div>
      )}

      {/* Item Detail Modal */}
      <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)}>
        {selectedItem && (
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <span className="text-4xl mb-2 block">{selectedItem.emoji}</span>
                <h3 className="text-xl font-bold text-slate-800">{selectedItem.name}</h3>
                <p className="text-slate-600 text-sm mt-1">{selectedItem.description}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 rounded-full hover:bg-slate-100"
              >
                <XIcon className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <ClockIcon className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-500">{selectedItem.prepTime} min</span>
            </div>

            <div className="flex items-center justify-between mb-6">
              <span className="text-2xl font-bold text-slate-800">
                {formatPrice(getEffectivePrice(selectedItem))}
              </span>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200"
                >
                  <MinusIcon className="w-5 h-5" />
                </button>
                <span className="text-lg font-semibold w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <Button
              onClick={handleAddFromModal}
              className="w-full"
              size="lg"
            >
              Add to Cart - {formatPrice(getEffectivePrice(selectedItem) * quantity)}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
