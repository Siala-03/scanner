import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsIcon,
  ShoppingCartIcon,
  ClipboardListIcon,
  BellRingIcon,
  CheckIcon } from
'lucide-react';
import { CartItem, MenuItem, Order } from '../../types';
import { MenuPage } from './MenuPage';
import { CartPage } from './CartPage';
import { OrderStatusPage } from './OrderStatusPage';
interface CustomerAppProps {
  tableNumber: number;
  orders: Order[];
  onPlaceOrder: (
  tableNumber: number,
  items: CartItem[],
  specialInstructions?: string)
  => void;
  onCallWaiter: () => void;
}
type CustomerTab = 'menu' | 'cart' | 'orders';
export function CustomerApp({
  tableNumber,
  orders,
  onPlaceOrder,
  onCallWaiter
}: CustomerAppProps) {
  const [activeTab, setActiveTab] = useState<CustomerTab>('menu');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const handleAddToCart = useCallback((item: MenuItem, quantity: number) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((ci) => ci.menuItem.id === item.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity
        };
        return updated;
      }
      return [
      ...prev,
      {
        menuItem: item,
        quantity
      }];

    });
  }, []);
  const handleUpdateQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (quantity <= 0) {
        setCartItems((prev) =>
        prev.filter((item) => item.menuItem.id !== itemId)
        );
      } else {
        setCartItems((prev) =>
        prev.map((item) =>
        item.menuItem.id === itemId ?
        {
          ...item,
          quantity
        } :
        item
        )
        );
      }
    },
    []
  );
  const handleRemoveItem = useCallback((itemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.menuItem.id !== itemId));
  }, []);
  const handlePlaceOrder = useCallback(
    (specialInstructions: string) => {
      onPlaceOrder(tableNumber, cartItems, specialInstructions);
      setCartItems([]);
      setActiveTab('orders');
    },
    [tableNumber, cartItems, onPlaceOrder]
  );
  const handleCallWaiterClick = () => {
    if (waiterCalled) return;
    onCallWaiter();
    setWaiterCalled(true);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
    // Reset the button state after 30 seconds
    setTimeout(() => {
      setWaiterCalled(false);
    }, 30000);
  };
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const tabs = [
  {
    id: 'menu' as const,
    label: 'Menu',
    icon: UtensilsIcon
  },
  {
    id: 'cart' as const,
    label: 'Cart',
    icon: ShoppingCartIcon,
    count: cartItemCount
  },
  {
    id: 'orders' as const,
    label: 'Orders',
    icon: ClipboardListIcon
  }];

  return (
    <div className="min-h-screen bg-[#faf6f0]">
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast &&
        <motion.div
          initial={{
            opacity: 0,
            y: -50,
            x: '-50%'
          }}
          animate={{
            opacity: 1,
            y: 20,
            x: '-50%'
          }}
          exit={{
            opacity: 0,
            y: -50,
            x: '-50%'
          }}
          className="fixed top-0 left-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-full shadow-lg font-medium flex items-center gap-2">

            <BellRingIcon className="w-5 h-5" />
            Waiter has been notified!
          </motion.div>
        }
      </AnimatePresence>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{
            opacity: 0,
            x: 20
          }}
          animate={{
            opacity: 1,
            x: 0
          }}
          exit={{
            opacity: 0,
            x: -20
          }}
          transition={{
            duration: 0.2
          }}>

          {activeTab === 'menu' && <MenuPage onAddToCart={handleAddToCart} />}
          {activeTab === 'cart' &&
          <CartPage
            cartItems={cartItems}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onPlaceOrder={handlePlaceOrder}
            tableNumber={tableNumber} />

          }
          {activeTab === 'orders' &&
          <OrderStatusPage orders={orders} tableNumber={tableNumber} />
          }
        </motion.div>
      </AnimatePresence>

      {/* Call Waiter Floating Button */}
      <motion.button
        whileTap={{
          scale: 0.9
        }}
        onClick={handleCallWaiterClick}
        className={`fixed bottom-24 right-6 z-40 px-4 py-3 rounded-full shadow-xl flex items-center gap-2 transition-colors ${waiterCalled ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
        animate={
        waiterCalled ?
        {} :
        {
          boxShadow: [
          '0px 0px 0px 0px rgba(245,158,11,0.4)',
          '0px 0px 0px 15px rgba(245,158,11,0)',
          '0px 0px 0px 0px rgba(245,158,11,0)']

        }
        }
        transition={{
          repeat: Infinity,
          duration: 2
        }}>

        {waiterCalled ? (
          <>
            <CheckIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Waiter called</span>
          </>
        ) : (
          <>
            <BellRingIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Call waiter</span>
          </>
        )}
      </motion.button>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8e4dc] px-6 py-3 safe-area-pb z-50">
        <div className="flex justify-around items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center gap-1 relative">

                <div className="relative">
                  <Icon
                    className={`w-6 h-6 transition-colors ${isActive ? 'text-amber-500' : 'text-slate-400'}`} />

                  {tab.count !== undefined && tab.count > 0 &&
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {tab.count}
                    </span>
                  }
                </div>
                <span
                  className={`text-xs font-medium transition-colors ${isActive ? 'text-amber-500' : 'text-slate-400'}`}>

                  {tab.label}
                </span>
                {isActive &&
                <motion.div
                  layoutId="customerTabIndicator"
                  className="absolute -bottom-3 w-1 h-1 bg-amber-500 rounded-full" />

                }
              </button>);

          })}
        </div>
      </nav>
    </div>);

}