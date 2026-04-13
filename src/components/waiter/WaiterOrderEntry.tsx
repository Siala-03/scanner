import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  CheckIcon
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
  const [showMobileCart, setShowMobileCart] = useState(false);

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
    const cartItem: CartItem = {
      tempId,
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
        menuItem: item.menuItem as any,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions
      }));
      await onSubmitOrder(orderItems, orderNotes || undefined);
      setCart([]);
      setOrderNotes('');
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
          className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 text-sm">
                {item.menuItemName}
              </h4>
              <p className="text-xs text-gray-500">
                {formatPrice(item.unitPrice || 0)} each
              </p>
            </div>
            <button
              onClick={() => removeFromCart(item.tempId)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateCartItemQuantity(item.tempId, -1)}
                className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <MinusIcon className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold text-gray-900">
                {item.quantity}
              </span>
              <button
                onClick={() => updateCartItemQuantity(item.tempId, 1)}
                className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
            <span className="font-semibold text-amber-600">
              {formatPrice(item.totalPrice || 0)}
            </span>
          </div>

          {item.notes && (
            <p className="mt-2 text-xs italic text-gray-500">
              Note: {item.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );

  const renderCartFooter = (buttonLabel: string) => (
    <>
      <div className="border-t border-gray-200 p-4">
        <textarea
          placeholder="Order notes (optional)..."
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
          className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          rows={2}
        />
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-gray-600">Total</span>
          <span className="text-xl font-bold text-gray-900">
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
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Main Content */}
      <div className="relative flex max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl md:max-h-[92vh] md:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 p-4 backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <ChevronLeftIcon className="w-6 h-6 text-gray-600" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900 sm:text-xl">
                  Take Order - Table {tableNumber}
                </h2>
                <p className="text-sm text-gray-500">
                  {cartItemCount} item{cartItemCount !== 1 ? 's' : ''} • {formatPrice(cartTotal)}
                </p>
              </div>
            </div>
            {cart.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="hidden items-center gap-2 lg:flex"
              >
                <CheckIcon className="w-4 h-4" />
                Submit Order
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {categoryNames[category] || category}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* Menu Items List */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <UtensilsIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No menu items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {filteredItems.map((item) => (
                    <motion.button
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                      onClick={() => {
                        setShowItemDetail(item);
                        setItemQuantity(1);
                      }}
                    >
                      <span className="text-3xl">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {item.name}
                        </h3>
                        <p className="text-sm text-gray-500 truncate">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-amber-600 font-semibold">
                            {formatPrice(item.price)}
                          </span>
                          {item.prepTime && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <ClockIcon className="w-3 h-3" />
                              {item.prepTime}m
                            </span>
                          )}
                        </div>
                      </div>
                      <PlusIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Sidebar (Desktop) / Bottom Sheet (Mobile) */}
            {cart.length > 0 && (
              <div className="hidden border-l border-gray-200 bg-gray-50 lg:flex lg:flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ShoppingCartIcon className="w-5 h-5" />
                    Order Items
                  </h3>
                </div>
                {renderCartItems()}
                {renderCartFooter('Submit Order')}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Cart Summary */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white p-4 lg:hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600">Total ({cartItemCount} items)</span>
              <span className="text-xl font-bold text-gray-900">
                {formatPrice(cartTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowMobileCart(true)}
                className="flex-1"
              >
                View Cart
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="flex-1"
              >
                Submit
              </Button>
            </div>
          </div>
        )}
      </div>

      {cart.length > 0 && showMobileCart && (
        <div className="absolute inset-0 z-20 flex items-end lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileCart(false)} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="relative flex max-h-[78vh] w-full flex-col rounded-t-3xl bg-gray-50"
          >
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <div>
                <h3 className="font-semibold text-gray-900">Cart Summary</h3>
                <p className="text-sm text-gray-500">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => setShowMobileCart(false)}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            {renderCartItems()}
            {renderCartFooter('Submit Order')}
          </motion.div>
        </div>
      )}

      {/* Item Detail Modal */}
      <Modal
        isOpen={!!showItemDetail}
        onClose={() => {
          setShowItemDetail(null);
          setItemQuantity(1);
        }}
        variant="light"
      >
        {showItemDetail && (
          <div className="p-6">
            <div className="flex justify-between items-start mb-5">
              <div className="flex-1">
                <span className="text-6xl mb-4 block">{showItemDetail.emoji}</span>
                <h3 className="text-2xl font-bold text-gray-900">
                  {showItemDetail.name}
                </h3>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  {showItemDetail.description}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowItemDetail(null);
                  setItemQuantity(1);
                }}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <XIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-amber-100 rounded-lg">
                <ClockIcon className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm text-gray-600">
                {showItemDetail.prepTime} minutes preparation time
              </span>
            </div>

            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Price
                </p>
                <span className="text-2xl font-bold text-amber-600">
                  {formatPrice(showItemDetail.price)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <MinusIcon className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-xl font-semibold w-12 text-center text-gray-900">
                  {itemQuantity}
                </span>
                <button
                  onClick={() => setItemQuantity(itemQuantity + 1)}
                  className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <PlusIcon className="w-5 h-5 text-gray-600" />
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