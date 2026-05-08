import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  XIcon,
  ChevronLeftIcon,
  ShoppingCartIcon,
  TrashIcon,
  UtensilsIcon,
  ClockIcon,
  CheckIcon,
  SparklesIcon
} from 'lucide-react';
import { MenuItem, OrderItem, CartItem } from '../../types/index';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatPrice } from '../../utils/currency';
import { useMenu } from '../../hooks/useMenu';

interface WaiterOrderEntryProps {
  tableNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSubmitOrder: (items: CartItem[], notes?: string) => void;
  existingOrder?: {
    id: string;
    items: OrderItem[];
  } | null;
}

interface LocalCartItem extends OrderItem {
  tempId: string;
  menuItem: MenuItem;
  notes?: string;
  modifiers?: string[];
}

export function WaiterOrderEntry({
  tableNumber,
  isOpen,
  onClose,
  onSubmitOrder,
  existingOrder
}: WaiterOrderEntryProps) {
  const { menuItems, isLoading } = useMenu();
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<LocalCartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [showItemDetail, setShowItemDetail] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'menu' | 'cart'>('menu');

  // Load existing order items into cart if editing
  useEffect(() => {
    if (existingOrder && isOpen && cart.length === 0) {
      const existingCart = existingOrder.items.map((item, index) => ({
        ...item,
        tempId: `existing-${index}`,
        notes: item.specialInstructions || '',
        modifiers: []
      }));
      setCart(existingCart);
    }
  }, [existingOrder, isOpen, cart.length]);

  useEffect(() => {
    if (isOpen) setActiveView('menu');
  }, [isOpen]);

  // Get unique categories from menu
  const categories = useMemo(() => {
    const cats = new Set(menuItems.map(item => item.category));
    return ['all', ...Array.from(cats)];
  }, [menuItems]);

  // Filter menu items
  const filteredItems = useMemo(() => {
    let items = menuItems.filter(item => item.isAvailable);
    
    if (activeCategory !== 'all') {
      items = items.filter(item => item.category === activeCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
      );
    }
    
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  // Calculate cart totals
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + ((item.unitPrice || 0) * item.quantity), 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Add item to cart
  const addToCart = (item: MenuItem, quantity = 1, notes = '') => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const cartItem: LocalCartItem = {
      tempId,
      menuItem: item,
      menuItemId: item.id,
      menuItemName: item.name,
      quantity,
      unitPrice: item.price,
      totalPrice: item.price * quantity,
      notes,
      modifiers: [],
      specialInstructions: notes
    };
    setCart(prev => [...prev, cartItem]);
    setShowItemDetail(null);
    setItemQuantity(1);
  };

  // Update cart item quantity
  const updateCartItemQuantity = (tempId: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.tempId === tempId) {
          const newQuantity = Math.max(1, item.quantity + delta);
          return {
            ...item,
            quantity: newQuantity,
            totalPrice: (item.unitPrice || 0) * newQuantity
          };
        }
        return item;
      })
    );
  };

  // Remove item from cart
  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.tempId !== tempId));
  };

  // Submit order
  const handleSubmit = async () => {
    if (cart.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const orderItems: CartItem[] = cart.map(({ tempId, ...item }) => ({
        menuItem: item.menuItem,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions
      }));
      await onSubmitOrder(orderItems, orderNotes || undefined);
      setCart([]);
      setOrderNotes('');
      setActiveView('menu');
      onClose();
    } catch (error) {
      console.error('Failed to submit order:', error);
      alert('Failed to submit order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Category display names
  const categoryNames: Record<string, string> = {
    all: 'All Items',
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

  const renderCartItems = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {cart.map((item) => (
        <div
          key={item.tempId}
          className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-slate-100 text-sm">
                {item.menuItemName}
              </h4>
              <p className="text-xs text-slate-500">
                {formatPrice(item.unitPrice || 0)} each
              </p>
            </div>
            <button
              onClick={() => removeFromCart(item.tempId)}
              className="p-1 text-slate-500 hover:text-red-400 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateCartItemQuantity(item.tempId, -1)}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <MinusIcon className="w-4 h-4 text-slate-200" />
              </button>
              <span className="w-8 text-center font-semibold text-slate-100">
                {item.quantity}
              </span>
              <button
                onClick={() => updateCartItemQuantity(item.tempId, 1)}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <PlusIcon className="w-4 h-4 text-slate-200" />
              </button>
            </div>
            <span className="font-semibold text-amber-300">
              {formatPrice(item.totalPrice || 0)}
            </span>
          </div>

          {item.notes && (
            <p className="mt-2 text-xs italic text-slate-500">
              Note: {item.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );

  const renderCartFooter = (buttonLabel: string) => (
    <>
      <div className="border-t border-slate-800 p-4">
        <textarea
          placeholder="Order notes (optional)..."
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
          className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          rows={2}
        />
      </div>

      <div className="border-t border-slate-800 bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-slate-400">Total</span>
          <span className="text-xl font-bold text-slate-100">
            {formatPrice(cartTotal)}
          </span>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          className="w-full"
        >
          {buttonLabel}
        </Button>
      </div>
    </>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Main Content */}
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 p-4 backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (activeView === 'cart') {
                    setActiveView('menu');
                  } else {
                    onClose();
                  }
                }}
                className="p-2 rounded-full hover:bg-slate-800 transition-colors"
              >
                <ChevronLeftIcon className="w-6 h-6 text-slate-300" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-100 sm:text-xl">
                  {activeView === 'menu' ? `Take Order - Table ${tableNumber}` : `Cart - Table ${tableNumber}`}
                </h2>
                <p className="text-sm text-slate-400">
                  {cartItemCount} item{cartItemCount !== 1 ? 's' : ''} • {formatPrice(cartTotal)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="primary" size="sm" className="bg-amber-500/20 text-amber-300">
                    Floor order
                  </Badge>
                  <Badge variant="secondary" size="sm" className="bg-slate-700 text-slate-300">
                    Live menu sync
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveView(activeView === 'menu' ? 'cart' : 'menu')}
                className="items-center gap-2 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                <ShoppingCartIcon className="w-4 h-4" />
                {activeView === 'menu' ? `Cart (${cartItemCount})` : 'Back to Menu'}
              </Button>
              {cart.length > 0 && activeView === 'cart' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  isLoading={isSubmitting}
                  className="items-center gap-2"
                >
                  <CheckIcon className="w-4 h-4" />
                  Submit Order
                </Button>
              )}
            </div>
          </div>

          {activeView === 'menu' && (
            <>
              {/* Search */}
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Categories */}
              <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === category
                        ? 'bg-amber-500 text-slate-900 shadow-[0_12px_30px_-18px_rgba(245,158,11,0.9)]'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {categoryNames[category] || category}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>
                  Showing {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Quick add enabled
                </span>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'menu' ? (
            <div className="h-full overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <UtensilsIcon className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                  <p>No menu items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredItems.map((item) => (
                    <motion.button
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -2 }}
                      className="flex items-center gap-3 rounded-3xl border border-slate-700 bg-slate-900/90 p-3 text-left transition-colors hover:border-amber-500/50 hover:bg-slate-800"
                      onClick={() => {
                        setShowItemDetail(item);
                        setItemQuantity(1);
                      }}
                    >
                      <span className="text-3xl">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" size="sm" className="bg-slate-700 text-slate-200">
                            {item.category}
                          </Badge>
                          {!!item.prepTime && (
                            <Badge variant="primary" size="sm" className="bg-amber-500/20 text-amber-300">
                              {item.prepTime}m prep
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-100 truncate">
                          {item.name}
                        </h3>
                        <p className="text-sm text-slate-400 truncate">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-amber-300 font-semibold">
                            {formatPrice(item.price)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-300">
                        <PlusIcon className="w-4 h-4" />
                        <span className="hidden text-xs font-semibold sm:inline">Add</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col bg-slate-950">
              <div className="border-b border-slate-800 p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                    <ShoppingCartIcon className="w-5 h-5" />
                    Order Items
                  </h3>
                  <Badge variant="count" size="sm">{cartItemCount}</Badge>
                </div>
                <p className="text-xs text-slate-500">Review the basket before sending it to the kitchen or bar.</p>
              </div>
              {cart.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <ShoppingCartIcon className="w-10 h-10 text-slate-700" />
                  <p className="text-sm">Your cart is empty</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveView('menu')}
                    className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                  >
                    Back to Menu
                  </Button>
                </div>
              ) : (
                <>
                  {renderCartItems()}
                  {renderCartFooter('Submit Order')}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Item Detail Modal */}
      <Modal
        isOpen={!!showItemDetail}
        onClose={() => {
          setShowItemDetail(null);
          setItemQuantity(1);
        }}
      >
        {showItemDetail && (
          <div className="p-6">
            <div className="flex justify-between items-start mb-5">
              <div className="flex-1">
                <span className="text-6xl mb-4 block">{showItemDetail.emoji}</span>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" size="sm" className="bg-slate-700 text-slate-200">{showItemDetail.category}</Badge>
                  <Badge variant="primary" size="sm" className="bg-amber-500/20 text-amber-300">
                    {showItemDetail.prepTime}m prep
                  </Badge>
                </div>
                <h3 className="text-2xl font-bold text-slate-100">
                  {showItemDetail.name}
                </h3>
                <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                  {showItemDetail.description}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowItemDetail(null);
                  setItemQuantity(1);
                }}
                className="p-2 rounded-full hover:bg-slate-800 transition-colors"
              >
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-amber-500/20 rounded-lg">
                <ClockIcon className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm text-slate-400">
                {showItemDetail.prepTime} minutes preparation time
              </span>
            </div>

            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                  Price
                </p>
                <span className="text-2xl font-bold text-amber-300">
                  {formatPrice(showItemDetail.price)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  <MinusIcon className="w-5 h-5 text-slate-200" />
                </button>
                <span className="text-xl font-semibold w-12 text-center text-slate-100">
                  {itemQuantity}
                </span>
                <button
                  onClick={() => setItemQuantity(itemQuantity + 1)}
                  className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  <PlusIcon className="w-5 h-5 text-slate-200" />
                </button>
              </div>
            </div>

            <Button
              onClick={() => addToCart(showItemDetail, itemQuantity)}
              className="w-full"
              size="lg"
              variant="primary"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Add to Order - {formatPrice(showItemDetail.price * itemQuantity)}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}