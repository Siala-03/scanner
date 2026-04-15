import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsIcon,
  ShoppingCartIcon,
  ClipboardListIcon,
  BellRingIcon,
  CheckIcon } from
'lucide-react';
import { CartItem, MenuItem, Order, Customer } from '../../types';
import { MenuPage } from './MenuPage';
import { CartPage } from './CartPage';
import { OrderStatusPage } from './OrderStatusPage';
interface CustomerAppProps {
  tableNumber: number;
  orders: Order[];
  restaurantName?: string;
  onPlaceOrder: (
  tableNumber: number,
  items: CartItem[],
  specialInstructions?: string,
  customer?: Customer | null,
  delivery?: { provider: string; address: string },
  loyaltyRewardId?: string
  )
  => Promise<void>;
  onCallWaiter: () => void;
}
type CustomerTab = 'menu' | 'cart' | 'orders';
export function CustomerApp({
  tableNumber,
  orders,
  restaurantName,
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
  const handleConfirmOrder = useCallback(
    async (
      specialInstructions: string,
      customer?: Customer | null,
      delivery?: { provider: string; address: string },
      loyaltyRewardId?: string
    ): Promise<void> => {
      if (typeof onPlaceOrder !== 'function') {
        console.error('onPlaceOrder prop is missing or not a function');
        throw new Error('Order placement is not available. Please refresh and try again.');
      }
      await onPlaceOrder(tableNumber, cartItems, specialInstructions, customer, delivery, loyaltyRewardId);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      {restaurantName && (
        <div className="bg-white/95 border-b border-slate-200 p-4 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Dining at</p>
          <h2 className="text-lg font-semibold text-slate-900">{restaurantName}</h2>
        </div>
      )}
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
          className="fixed top-0 left-1/2 z-[100] bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3.5 rounded-2xl shadow-xl font-semibold flex items-center gap-2">

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
            onPlaceOrder={handleConfirmOrder}
            tableNumber={tableNumber}
            onCallWaiter={onCallWaiter}
          />

          }
          {activeTab === 'orders' &&
          <OrderStatusPage orders={orders} tableNumber={tableNumber} />
          }
        </motion.div>
      </AnimatePresence>

      {/* Call Waiter Floating Button - Only show on non-cart pages */}
      {activeTab !== 'cart' && (
        <motion.button
          whileTap={{
            scale: 0.9
          }}
          onClick={handleCallWaiterClick}
          className={`fixed bottom-20 right-6 z-40 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 transition-all duration-300 ${waiterCalled 
            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-500/30' 
            : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-amber-500/30 hover:shadow-amber-500/40'}`}
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
              <span className="text-sm font-semibold">Waiter called</span>
            </>
          ) : (
            <>
              <BellRingIcon className="w-5 h-5" />
              <span className="text-sm font-semibold">Call Waiter</span>
            </>
          )}
        </motion.button>
      )}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-white/20 px-6 py-3 safe-area-pb z-50 shadow-2xl">
        <div className="flex justify-around items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center gap-1 relative py-2 px-4 rounded-2xl transition-all duration-300">

                <div className="relative">
                  <Icon
                    className={`w-6 h-6 transition-all duration-300 ${isActive ? 'text-amber-600 scale-110' : 'text-slate-400'}`} />

                  {tab.count !== undefined && tab.count > 0 &&
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30">
                      {tab.count}
                    </span>
                  }
                </div>
                <span
                  className={`text-xs font-semibold transition-all duration-300 ${isActive ? 'text-amber-600' : 'text-slate-400'}`}>

                  {tab.label}
                </span>
                {isActive &&
                <motion.div
                  layoutId="customerTabIndicator"
                  className="absolute -bottom-1 w-8 h-0.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full" />

                }
              </button>);

          })}
        </div>
      </nav>
    </div>);

}