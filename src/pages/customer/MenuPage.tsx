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
    menuItems.filter((item) => item.isPopular && item.isAvailable).slice(0, 6),
    [menuItems]
  );

  const filteredItems = useMemo(() => {
    let items =
    activeCategory === 'all' ?
    menuItems :
    menuItems.filter((item) => item.category === activeCategory);
    items = items.filter((item) => item.isAvailable);
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
    name: categoryNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)
  }));

  const categoryTabs = [
    { id: 'all', name: 'All' },
    ...menuCategories
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Restaurant Menu</p>
              <h1 className="text-3xl font-bold text-slate-900">Order from your table</h1>
              <p className="text-slate-500 mt-1">Browse dishes, add to your cart, and place orders instantly.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refetch}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                <RefreshCwIcon className="w-4 h-4" />
                Refresh
              </button>
              {error && (
                <div className="text-red-500 text-xs font-medium">{error}</div>
              )}
            </div>
          </div>

          <div className="mt-4 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto pb-2">
            {categoryTabs.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`h-9 px-3 rounded-full text-xs font-semibold transition-all ${
                  activeCategory === category.id
                    ? 'bg-slate-900 text-white shadow'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
        </div>
      )}

      {!isLoading && activeCategory === 'all' && searchQuery === '' && popularItems.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon className="w-5 h-5 text-slate-700" />
            <h2 className="text-xl font-semibold text-slate-900">Popular</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {activeCategory === 'all' ? 'Full Menu' : categoryNames[activeCategory] || activeCategory}
            </h2>
            <span className="text-sm text-slate-500">{filteredItems.length} items</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg font-semibold text-slate-700">No items found</p>
              <p className="text-sm">Try another category or clear your search.</p>
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
