import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBagIcon, ArrowRightIcon, CheckCircleIcon } from 'lucide-react';
import { CartItem, MenuItem } from '../../types';
import { CartItemCard } from '../../components/customer/CartItem';
import { Button } from '../../components/ui/Button';
import { TextArea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';
interface CartPageProps {
  cartItems: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onPlaceOrder: (specialInstructions: string) => void;
  tableNumber: number;
}
export function CartPage({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  tableNumber
}: CartPageProps) {
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const subtotal = cartItems.reduce(
    (sum, item) => sum + getEffectivePrice(item.menuItem) * item.quantity,
    0
  );
  const total = subtotal;
  const handlePlaceOrder = async () => {
    setIsOrdering(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    onPlaceOrder(specialInstructions);
    setOrderPlaced(true);
    setIsOrdering(false);
  };
  if (orderPlaced) {
    return (
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.9
        }}
        animate={{
          opacity: 1,
          scale: 1
        }}
        className="min-h-screen bg-[#faf6f0] flex items-center justify-center p-4">

        <div className="text-center">
          <motion.div
            initial={{
              scale: 0
            }}
            animate={{
              scale: 1
            }}
            transition={{
              type: 'spring',
              delay: 0.2
            }}
            className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">

            <CheckCircleIcon className="w-10 h-10 text-green-600" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Order Placed!
          </h2>
          <p className="text-slate-500 mb-6">
            Your order has been sent to the kitchen.
            <br />
            We'll notify you when it's ready.
          </p>
          <Button variant="primary" onClick={() => setOrderPlaced(false)}>
            Back to Menu
          </Button>
        </div>
      </motion.div>);

  }
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-[#faf6f0] flex items-center justify-center p-4">
        <EmptyState
          icon={<ShoppingBagIcon className="w-8 h-8" />}
          title="Your cart is empty"
          description="Browse our menu and add some delicious items to your cart." />

      </div>);

  }
  return (
    <div className="min-h-screen bg-[#faf6f0] pb-48">
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Your Order</h1>
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            Table {tableNumber}
          </span>
        </div>

        {/* Cart items */}
        <div className="space-y-3 mb-6">
          <AnimatePresence mode="popLayout">
            {cartItems.map((item) =>
            <motion.div
              key={item.menuItem.id}
              layout
              initial={{
                opacity: 0,
                x: -20
              }}
              animate={{
                opacity: 1,
                x: 0
              }}
              exit={{
                opacity: 0,
                x: 20,
                height: 0
              }}>

                <CartItemCard
                item={item}
                onUpdateQuantity={onUpdateQuantity}
                onRemove={onRemoveItem} />

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Special instructions */}
        <div className="mb-6">
          <div className="w-full">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Special Instructions
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 resize-none"
              placeholder="Any allergies or special requests?"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              rows={3} />

          </div>
        </div>
      </div>

      {/* Order summary - fixed bottom */}
      <div className="fixed bottom-[72px] left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.08)] p-6 pb-8 z-40">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handlePlaceOrder}
          isLoading={isOrdering}>

          Place Order
          <ArrowRightIcon className="w-5 h-5" />
        </Button>
      </div>
    </div>);

}