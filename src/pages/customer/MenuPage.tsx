import React, { useMemo, useState } from 'react';
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
import { MenuItem } from '../../types';
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 pb-24">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-600 font-semibold">Fine Dining Experience</p>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Order from your table</h1>
              <p className="text-slate-500 mt-1 text-sm">Exquisite dishes, crafted for your pleasure</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={refetch}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-semibold hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-lg transition-all duration-200 touch-manipulation"
              >
                <RefreshCwIcon className="w-4 h-4" />
                <span className="hidden xs:inline">Refresh</span>
              </button>
              {error && (
                <div className="text-red-500 text-xs font-medium max-w-32 sm:max-w-none truncate">{error}</div>
              )}
            </div>
          </div>

          <div className="mt-4 sm:mt-5 relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search our menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all duration-200 text-base"
            />
          </div>

          <div className="mt-4 sm:mt-5">
            <div className="flex flex-wrap gap-2 sm:gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
              {categoryTabs.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`h-9 sm:h-10 px-3 sm:px-4 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation min-w-0 flex-shrink-0 ${
                    activeCategory === category.id
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent hover:border-slate-300'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
        </div>
      )}

      {!isLoading && activeCategory === 'all' && searchQuery === '' && popularItems.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl shadow-lg">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Chef's Selection</h2>
              <p className="text-xs text-slate-500">Most loved by our guests</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
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
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4 sm:mb-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full"></div>
                <h2 className="text-lg font-bold text-slate-900">
                  {activeCategory === 'all' ? 'Our Menu' : categoryNames[activeCategory] || activeCategory}
                </h2>
              </div>
              <span className="text-sm text-slate-400 font-medium">{filteredItems.length} items</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
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
        </div>
      )}

      {/* Item Detail Modal */}
      <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} variant="light">
        {selectedItem && (
          <div className="p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 sm:mb-5">
              <div className="flex-1 min-w-0">
                <span className="text-4xl sm:text-5xl mb-3 block">{selectedItem.emoji}</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 pr-8">{selectedItem.name}</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{selectedItem.description}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 sm:p-2.5 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0 touch-manipulation"
              >
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              <div className="p-1.5 bg-amber-100 rounded-lg">
                <ClockIcon className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm text-slate-600">{selectedItem.prepTime} minutes preparation time</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4 sm:mb-6 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Price</p>
                <span className="text-2xl font-bold text-amber-600">
                  {formatPrice(getEffectivePrice(selectedItem))}
                </span>
              </div>
              
              <div className="flex items-center justify-center sm:justify-end gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-3 sm:p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors touch-manipulation"
                >
                  <MinusIcon className="w-5 h-5 text-slate-600" />
                </button>
                <span className="text-lg font-semibold w-12 sm:w-8 text-center text-slate-900">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-3 sm:p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors touch-manipulation"
                >
                  <PlusIcon className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            <Button
              onClick={handleAddFromModal}
              className="w-full touch-manipulation"
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
