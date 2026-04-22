import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingCartIcon, CheckCircleIcon, AlertCircleIcon, PhoneIcon } from 'lucide-react';
import { MenuItem, CartItem } from '../../types';
import { useMenu } from '../../hooks/useMenu';
import { MenuItemCard } from '../../components/customer/MenuItemCard';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { formatPrice } from '../../utils/currency';
import { createOnlineOrder, getOnlineQRCodeByToken } from '../../api/onlineOrders';

interface OnlineOrderingPageProps {
  qrCodeToken: string;
  restaurantName?: string;
}

type PageStep = 'menu' | 'cart' | 'checkout' | 'success';

export function OnlineOrderingPage({ qrCodeToken, restaurantName }: OnlineOrderingPageProps) {
  const { menuItems, isLoading: menuLoading } = useMenu();
  const [step, setStep] = useState<PageStep>('menu');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeId, setQrCodeId] = useState<string | null>(null);
  const [lastOrderNumber, setLastOrderNumber] = useState<string>('');

  // Get restaurant from QR code token
  useEffect(() => {
    const loadQRCode = async () => {
      try {
        const code = await getOnlineQRCodeByToken(qrCodeToken);
        if (code) {
          setQrCodeId(code.id);
        } else {
          setError('Invalid or expired QR code. Please try again.');
        }
      } catch (err) {
        console.error('Failed to validate QR code:', err);
        setError('Failed to load order page. Please try again.');
      }
    };

    loadQRCode();
  }, [qrCodeToken]);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.menuItem?.price || 0) * item.quantity, 0),
    [cartItems]
  );

  const tax = useMemo(() => Math.round(subtotal * 0.1), [subtotal]);
  const total = subtotal + tax;

  const handleAddToCart = (item: MenuItem, qty: number = 1) => {
    setCartItems((prev) => {
      const existing = prev.findIndex((ci) => ci.menuItem?.id === item.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = {
          ...updated[existing],
          quantity: updated[existing].quantity + qty,
        };
        return updated;
      }
      return [...prev, { menuItem: item, quantity: qty }];
    });
    setSelectedItem(null);
  };

  const handleUpdateQuantity = (itemId: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((item) => item.menuItem?.id !== itemId));
    } else {
      setCartItems((prev) =>
        prev.map((item) =>
          item.menuItem?.id === itemId ? { ...item, quantity: qty } : item
        )
      );
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.menuItem?.id !== itemId));
  };

  const handlePlaceOrder = async () => {
    if (!customerName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!customerEmail.trim()) {
      setError('Please enter your email');
      return;
    }
    if (cartItems.length === 0) {
      setError('Please add items to your order');
      return;
    }
    if (!qrCodeId) {
      setError('QR code not found. Please try again.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const order = await createOnlineOrder(
        qrCodeToken, // We'll use the token to identify the restaurant
        qrCodeId,
        customerName,
        customerEmail,
        cartItems.map((ci) => ({
          menuItemId: ci.menuItem?.id,
          menuItemName: ci.menuItem?.name,
          quantity: ci.quantity,
          unitPrice: ci.menuItem?.price || 0,
          totalPrice: (ci.menuItem?.price || 0) * ci.quantity,
        })),
        specialInstructions
      );

      setLastOrderNumber(order.orderNumber || '');
      setStep('success');
      setCartItems([]);
      setCustomerName('');
      setCustomerEmail('');
      setSpecialInstructions('');
    } catch (err) {
      console.error('Failed to place order:', err);
      setError('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Invalid QR code
  if (error && step !== 'checkout') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="flex justify-center mb-4">
            <AlertCircleIcon className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-slate-100 mb-2">
            Oops!
          </h1>
          <p className="text-center text-slate-600 dark:text-slate-300 mb-6">{error}</p>
          <Button onClick={() => window.location.reload()} className="w-full">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Success Page
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <CheckCircleIcon className="w-16 h-16 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Order Placed!
          </h1>
          {lastOrderNumber && (
            <div className="mb-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Order Number</p>
              <p className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">
                {lastOrderNumber}
              </p>
            </div>
          )}
          <p className="text-slate-600 dark:text-slate-300 mb-2">
            Your order has been received and sent to our kitchen.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            You'll receive updates on your email: <strong>{customerEmail}</strong>
          </p>

          <div className="space-y-3">
            <Button
              onClick={() => {
                setStep('menu');
                setError(null);
              }}
              variant="primary"
              className="w-full"
            >
              Place Another Order
            </Button>
            <Button
              onClick={() => {
                // Could integrate with order tracking here
                alert('Order tracking coming soon!');
              }}
              variant="secondary"
              className="w-full"
            >
              Track Order
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Main ordering interface
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {restaurantName || 'Order Online'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Fast & Easy Online Ordering</p>
          </div>

          {step !== 'checkout' && step !== 'success' && (
            <Button
              onClick={() => setStep('cart')}
              variant={step === 'cart' ? 'primary' : 'secondary'}
              className="relative"
            >
              <ShoppingCartIcon className="w-4 h-4 mr-2" />
              Cart ({cartItems.length})
              {cartItems.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg m-4">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Menu Page */}
      {step === 'menu' && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          {menuLoading ? (
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">Loading menu...</p>
            </div>
          ) : menuItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">Menu not available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAddToCart={() => {
                    setSelectedItem(item);
                    setQuantity(1);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cart Page */}
      {step === 'cart' && (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Your Cart</h2>

          {cartItems.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg">
              <ShoppingCartIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400">Your cart is empty</p>
              <Button
                onClick={() => setStep('menu')}
                variant="primary"
                className="mt-4"
              >
                Continue Shopping
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                {cartItems.map((item) => (
                  <div
                    key={item.menuItem?.id}
                    className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.menuItem?.name}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {formatPrice((item.menuItem?.price || 0) * item.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleUpdateQuantity(item.menuItem?.id || '', item.quantity - 1)
                        }
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          handleUpdateQuantity(item.menuItem?.id || '', item.quantity + 1)
                        }
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded"
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.menuItem?.id || '')}
                        className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Special Instructions */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Special Instructions (Optional)
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Any allergies, preferences, or special requests?"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Totals */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg mb-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                  <span className="font-semibold">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Tax (10%)</span>
                  <span className="font-semibold">{formatPrice(tax)}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatPrice(total)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={() => setStep('menu')}
                  variant="secondary"
                  className="flex-1"
                >
                  Add More Items
                </Button>
                <Button
                  onClick={() => setStep('checkout')}
                  variant="primary"
                  className="flex-1"
                >
                  <ShoppingCartIcon className="w-4 h-4 mr-2" />
                  Checkout
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Checkout Page */}
      {step === 'checkout' && (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
            Complete Your Order
          </h2>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Your Name *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Order Summary */}
            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Order Summary ({cartItems.length} items)
              </h4>
              <div className="space-y-2 text-sm mb-3">
                {cartItems.map((item) => (
                  <div key={item.menuItem?.id} className="flex justify-between">
                    <span>
                      {item.quantity}x {item.menuItem?.name}
                    </span>
                    <span className="font-medium">
                      {formatPrice((item.menuItem?.price || 0) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-blue-600 dark:text-blue-400">{formatPrice(total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={() => setStep('cart')}
                variant="secondary"
                className="flex-1"
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                onClick={handlePlaceOrder}
                variant="primary"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Placing Order...' : 'Place Order'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
