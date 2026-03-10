import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SearchIcon,
  SparklesIcon,
  XIcon,
  MinusIcon,
  PlusIcon,
  ClockIcon } from
'lucide-react';
import { MenuItem, MenuCategory, CartItem } from '../../types';
import { menuItems, menuCategories, getPopularItems } from '../../data/menuData';
import { MenuItemCard } from '../../components/customer/MenuItemCard';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';
interface MenuPageProps {
  onAddToCart: (item: MenuItem, quantity: number) => void;
}
export function MenuPage({ onAddToCart }: MenuPageProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const popularItems = useMemo(() => getPopularItems(), []);
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
  }, [activeCategory, searchQuery]);
  const handleAddToCart = (item: MenuItem) => {
    onAddToCart(item, 1);
  };
  const handleAddFromModal = () => {
    if (selectedItem) {
      onAddToCart(selectedItem, quantity);
      setSelectedItem(null);
      setQuantity(1);
    }
  };
  const categories = [
  {
    id: 'all',
    name: 'All',
    emoji: '🍽️'
  },
  ...menuCategories];

  return (
    <div className="min-h-screen bg-[#faf6f0] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#faf6f0]/95 backdrop-blur-sm px-4 pt-4 pb-2">
        {/* Search */}
        <div className="relative mb-4">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-white shadow-sm border-0 focus:outline-none focus:ring-2 focus:ring-amber-500" />

          {searchQuery &&
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600">

              <XIcon className="w-4 h-4" />
            </button>
          }
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {categories.map((category) =>
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={`
                flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all duration-200
                ${activeCategory === category.id ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100'}
              `}>

              <span>{category.emoji}</span>
              {category.name}
            </button>
          )}
        </div>
      </div>

      <div className="px-4">
        {/* Popular section */}
        {activeCategory === 'all' && !searchQuery &&
        <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <SparklesIcon className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-slate-900">
                Popular Right Now
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {popularItems.slice(0, 6).map((item) =>
            <motion.div
              key={item.id}
              whileTap={{
                scale: 0.95
              }}
              onClick={() => setSelectedItem(item)}
              className="flex-shrink-0 w-36 bg-white rounded-xl p-4 shadow-sm cursor-pointer">

                  <p className="font-medium text-slate-900 text-sm truncate mb-1">
                    {item.name}
                  </p>
                  <p className="text-amber-600 font-semibold text-sm">
                    {formatPrice(getEffectivePrice(item))}
                  </p>
                </motion.div>
            )}
            </div>
          </div>
        }

        {/* Menu grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, index) =>
            <motion.div
              key={item.id}
              initial={{
                opacity: 0,
                y: 20
              }}
              animate={{
                opacity: 1,
                y: 0
              }}
              exit={{
                opacity: 0,
                scale: 0.9
              }}
              transition={{
                delay: index * 0.05
              }}
              className="h-full">

                <MenuItemCard
                item={item}
                onAddToCart={handleAddToCart}
                onViewDetails={setSelectedItem} />

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {filteredItems.length === 0 &&
        <div className="text-center py-12">
            <span className="text-4xl block mb-3">🔍</span>
            <p className="text-slate-600">No items found</p>
            <p className="text-sm text-slate-400">
              Try a different search term
            </p>
          </div>
        }
      </div>

      {/* Item detail modal */}
      <Modal
        isOpen={!!selectedItem}
        onClose={() => {
          setSelectedItem(null);
          setQuantity(1);
        }}
        size="md">

        {selectedItem &&
        <div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {selectedItem.name}
              </h2>
              <p className="text-slate-500">{selectedItem.description}</p>
            </div>

            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-2 text-slate-500">
                <ClockIcon className="w-4 h-4" />
                <span className="text-sm">{selectedItem.prepTime} min</span>
              </div>
              {selectedItem.isPopular &&
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                  Popular
                </span>
            }
            </div>

            <div className="flex items-center justify-between bg-slate-100 rounded-xl p-4 mb-6">
              <span className="text-2xl font-bold text-slate-900">
                {formatPrice(getEffectivePrice(selectedItem))}
              </span>

              <div className="flex items-center gap-3">
                <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-2 rounded-lg bg-white shadow-sm hover:bg-slate-50 transition-colors">

                  <MinusIcon className="w-5 h-5 text-slate-600" />
                </button>
                <span className="w-8 text-center font-semibold text-lg">
                  {quantity}
                </span>
                <button
                onClick={() => setQuantity(quantity + 1)}
                className="p-2 rounded-lg bg-white shadow-sm hover:bg-slate-50 transition-colors">

                  <PlusIcon className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleAddFromModal}
            disabled={!selectedItem.isAvailable}>

              {selectedItem.isAvailable ?
            `Add to Cart - ${formatPrice(getEffectivePrice(selectedItem) * quantity)}` :
            'Currently Unavailable'}
            </Button>
          </div>
        }
      </Modal>
    </div>);

}