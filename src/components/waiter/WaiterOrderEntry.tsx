import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  XIcon,
  ShoppingCartIcon,
  TrashIcon,
  UtensilsIcon
} from 'lucide-react';
import { MenuItem, OrderItem, CartItem } from '../../types/index';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatPrice } from '../../utils/currency';
import { buildChitHtml } from '../../utils/receipt';
import { useMenu } from '../../hooks/useMenu';

interface WaiterOrderEntryProps {
  tableNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSubmitOrder: (items: CartItem[], notes?: string) => void;
  existingOrder?: { id: string; items: OrderItem[] } | null;
  restaurantName?: string;
  restaurantInfo?: { logo?: string; address?: string; city?: string; country?: string; phone?: string; email?: string; momoCode?: string };
  waiterName?: string;
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
  existingOrder,
  restaurantName,
  restaurantInfo,
  waiterName,
}: WaiterOrderEntryProps) {
  const { menuItems, isLoading } = useMenu();
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<LocalCartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);

  // Reset state when order entry opens fresh
  useEffect(() => {
    if (isOpen) {
      setCart([]);
      setOrderNotes('');
      setShowCart(false);
      setActiveCategory('all');
    }
  }, [isOpen]);

  // Get unique categories from menu
  const categories = useMemo(() => {
    const cats = new Set(menuItems.map(item => item.category));
    return ['all', ...Array.from(cats)];
  }, [menuItems]);

  // Filter menu items — show all items including out-of-stock (waiter needs to see them)
  const filteredItems = useMemo(() => {
    let items = [...menuItems];

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

    // Sort: available items first, then out-of-stock at the bottom
    items.sort((a, b) => (a.isAvailable === b.isAvailable ? 0 : a.isAvailable ? -1 : 1));

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
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (line) => line.menuItemId === item.id && !line.specialInstructions && !notes
      );

      if (existingIndex >= 0) {
        return prev.map((line, idx) => {
          if (idx !== existingIndex) return line;
          const nextQty = line.quantity + quantity;
          return {
            ...line,
            quantity: nextQty,
            totalPrice: (line.unitPrice || 0) * nextQty,
          };
        });
      }

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
      return [...prev, cartItem];
    });
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

    // Open print window NOW — during user gesture, before any await
    let chitPrintWindow: Window | null = null;
    try {
      chitPrintWindow = window.open('', 'chit_print', 'width=302,height=700,toolbar=0,scrollbars=1,status=0');
      if (chitPrintWindow) {
        chitPrintWindow.document.write('<html><body style="background:#fff;font-family:Arial;padding:40px;text-align:center;color:#555"><p>Preparing chit…</p></body></html>');
      }
    } catch { /* popup blocked */ }

    setIsSubmitting(true);
    try {
      const orderItems: CartItem[] = cart.map(({ tempId, ...item }) => ({
        menuItem: item.menuItem,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions
      }));
      await onSubmitOrder(orderItems, orderNotes || undefined);

      // Fill in the chit after order is placed
      if (chitPrintWindow && !chitPrintWindow.closed) {
        try {
          const label = tableNumber === 0 ? 'Bar / Walk-up' : `Table ${tableNumber}`;
          const chitHtml = buildChitHtml({
            restaurantName,
            restaurantLogo: restaurantInfo?.logo,
            restaurantAddress: restaurantInfo?.address,
            restaurantPhone: restaurantInfo?.phone,
            restaurantEmail: restaurantInfo?.email,
            restaurantCity: restaurantInfo?.city,
            restaurantCountry: restaurantInfo?.country,
            restaurantMomoCode: restaurantInfo?.momoCode,
            tableLabel: label,
            orderNumber: Date.now(),
            waiterName,
            items: cart.map(item => ({
              quantity: item.quantity,
              name: item.menuItemName ?? item.menuItem?.name ?? 'Item',
              notes: item.specialInstructions || undefined,
              totalPrice: (item.unitPrice ?? item.menuItem?.price ?? 0) * item.quantity,
            })),
            total: cart.reduce((s, i) => s + (i.unitPrice ?? i.menuItem?.price ?? 0) * i.quantity, 0),
            notes: orderNotes.trim() || undefined,
          });
          chitPrintWindow.document.open();
          chitPrintWindow.document.write(chitHtml);
          chitPrintWindow.document.close();
        } catch { chitPrintWindow?.close(); }
      }

      setCart([]);
      setOrderNotes('');
      setShowCart(false);
      onClose();
    } catch (error) {
      console.error('Failed to submit order:', error);
      try { chitPrintWindow?.close(); } catch { /* ignore */ }
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
    <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
      {cart.map((item) => (
        <div
          key={item.tempId}
          className="rounded-xl border border-slate-700 bg-slate-900/80 p-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-slate-100 text-sm truncate">
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

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateCartItemQuantity(item.tempId, -1)}
                className="w-7 h-7 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                <MinusIcon className="w-4 h-4 text-slate-200" />
              </button>
              <span className="w-8 text-center font-semibold text-slate-100">
                {item.quantity}
              </span>
              <button
                onClick={() => updateCartItemQuantity(item.tempId, 1)}
                className="w-7 h-7 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center"
              >
                <PlusIcon className="w-4 h-4 text-slate-200" />
              </button>
            </div>
            <span className="font-semibold text-amber-300 text-sm">
              {formatPrice(item.totalPrice || 0)}
            </span>
          </div>

          {item.notes && (
            <p className="mt-2 text-xs italic text-slate-500 truncate">
              Note: {item.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );

  const renderCartFooter = (buttonLabel: string) => (
    <>
      <div className="border-t border-slate-800 p-2.5">
        <textarea
          placeholder="Order notes (optional)..."
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
          className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          rows={2}
        />
      </div>

      <div className="border-t border-slate-800 bg-slate-950 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-slate-400 text-sm">Total</span>
          <span className="font-bold text-slate-100">
            {formatPrice(cartTotal)}
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
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
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Main Content */}
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 p-3 sm:p-4 backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-slate-800 transition-colors"
              >
                <XIcon className="w-6 h-6 text-slate-300" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-100 sm:text-xl">
                  {existingOrder ? `Add to Table ${tableNumber}` : `Take Order - Table ${tableNumber}`}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  {existingOrder
                    ? `${existingOrder.items.length} already on table · ${cartItemCount} new`
                    : `${cartItemCount} item${cartItemCount !== 1 ? 's' : ''} • ${formatPrice(cartTotal)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCart(true)}
                className="items-center gap-2 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                <ShoppingCartIcon className="w-4 h-4" />
                {existingOrder ? `New (${cartItemCount})` : `Cart (${cartItemCount})`}
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            </div>
            <button
              onClick={() => setSearchQuery(searchQuery.trim())}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              Search
            </button>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Categories */}
          <div className="-mx-3 sm:-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-3 sm:px-4 pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === category
                    ? 'bg-amber-500 text-slate-900 shadow-[0_12px_30px_-18px_rgba(245,158,11,0.9)]'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {categoryNames[category] || category}
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span>
              Showing {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-950">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
                {filteredItems.map((item) => {
                  const outOfStock = !item.isAvailable;
                  return (
                    <motion.button
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={outOfStock ? {} : { y: -2 }}
                      disabled={outOfStock}
                      className={`relative flex flex-col items-start rounded-2xl border p-3 text-left transition-colors ${
                        outOfStock
                          ? 'border-slate-800 bg-slate-900/40 opacity-60 cursor-not-allowed'
                          : 'border-slate-700 bg-slate-900/90 hover:border-amber-500/50 hover:bg-slate-800'
                      }`}
                      onClick={() => !outOfStock && addToCart(item, 1)}
                    >
                      <span className="text-2xl sm:text-3xl mb-1">{item.emoji}</span>
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" size="sm" className="bg-slate-700 text-slate-200">
                          {item.category}
                        </Badge>
                        {outOfStock && (
                          <Badge variant="secondary" size="sm" className="bg-red-500/20 text-red-400 border border-red-500/30">
                            Out of Stock
                          </Badge>
                        )}
                      </div>
                      <h3 className={`font-semibold text-sm sm:text-base line-clamp-2 leading-tight ${outOfStock ? 'text-slate-500' : 'text-slate-100'}`}>
                        {item.name}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 mt-1">
                        {item.description}
                      </p>
                      <div className="mt-2 flex items-center justify-between w-full gap-2">
                        <span className={`font-semibold text-sm sm:text-base ${outOfStock ? 'text-slate-500' : 'text-amber-300'}`}>{formatPrice(item.price)}</span>
                        {!!item.prepTime && (
                          <span className="text-[11px] text-slate-400">{item.prepTime}m</span>
                        )}
                      </div>
                      {outOfStock ? (
                        <div className="absolute top-2 right-2 flex flex-shrink-0 items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-400">
                          <XIcon className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="absolute top-2 right-2 flex flex-shrink-0 items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
                          <PlusIcon className="w-4 h-4" />
                          <span className="hidden sm:inline text-xs font-semibold">Add</span>
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className={`fixed inset-0 z-30 lg:static lg:z-auto lg:flex flex-col w-full lg:w-[22rem] xl:w-[24rem] bg-slate-900 border-l border-slate-800 transition-transform duration-200 ${showCart ? 'flex' : 'hidden lg:flex'}`}
          >
            <div className="border-b border-slate-800 p-2.5 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <ShoppingCartIcon className="w-5 h-5" />
                {existingOrder
                  ? <span className="text-sm text-amber-300 font-medium">Adding to order</span>
                  : <Badge variant="count" size="sm">{cartItemCount}</Badge>}
              </h3>
              <button
                onClick={() => setShowCart(false)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Read-only existing order context */}
            {existingOrder && existingOrder.items.length > 0 && (
              <div className="border-b border-slate-700 bg-slate-950/60 p-2.5 shrink-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Already on table</p>
                <div className="space-y-1">
                  {existingOrder.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400 flex-1 truncate">
                        {item.menuItemName || 'Item'} <span className="text-slate-600">×{item.quantity}</span>
                      </span>
                      <span className="text-slate-500 shrink-0">{formatPrice((item.unitPrice || 0) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-700/50 flex justify-between text-xs">
                  <span className="text-slate-600">Existing total</span>
                  <span className="text-slate-400 font-medium">
                    {formatPrice(existingOrder.items.reduce((s, i) => s + (i.unitPrice || 0) * i.quantity, 0))}
                  </span>
                </div>
              </div>
            )}

            {/* New items */}
            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 p-4">
                <ShoppingCartIcon className="w-10 h-10 text-slate-700" />
                <p className="text-sm text-center">
                  {existingOrder ? 'Select items to add to this order' : 'Your cart is empty'}
                </p>
              </div>
            ) : (
              <>
                {existingOrder && (
                  <p className="px-2.5 pt-2.5 pb-0 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">New items</p>
                )}
                {renderCartItems()}
                {renderCartFooter(existingOrder ? 'Add Items to Order' : 'Submit Order')}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}