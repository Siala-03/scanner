import { useCallback, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsIcon,
  ShoppingCartIcon,
  ClipboardListIcon,
  BellRingIcon,
  CheckIcon,
  GlobeIcon,
  CalendarIcon,
} from 'lucide-react';
import { CartItem, MenuItem, Order, Customer, SelectedModifier } from '../../types';
import { MenuPage } from './MenuPage';
import { CartPage } from './CartPage';
import { OrderStatusPage } from './OrderStatusPage';
import { getMenuItemCartKey } from '../../utils/menuKeys';
import { createReservation } from '../../api/reservations';

function ReservationBookingForm({ restaurantId, restaurantName }: { restaurantId?: string; restaurantName?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    partySize: 2,
    reservationDate: today,
    reservationTime: '19:00',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    const rid = restaurantId || localStorage.getItem('restaurantId') || '';
    if (!rid) { setError('Restaurant not found.'); return; }
    setSaving(true);
    setError('');
    try {
      await createReservation({
        restaurantId: rid,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        partySize: Number(form.partySize),
        reservationDate: form.reservationDate,
        reservationTime: form.reservationTime,
        notes: form.notes.trim() || undefined,
      });
      setConfirmed(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit reservation. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Reservation Submitted!</h2>
        <p className="text-slate-500 text-sm mb-1">We'll confirm your booking shortly.</p>
        <p className="text-slate-400 text-xs">You'll receive a WhatsApp confirmation once a staff member reviews your request.</p>
        <button
          onClick={() => { setConfirmed(false); setForm({ customerName: '', customerPhone: '', partySize: 2, reservationDate: today, reservationTime: '19:00', notes: '' }); }}
          className="mt-6 px-6 py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition-colors"
        >
          Make Another Reservation
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
          <CalendarIcon className="w-6 h-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Reserve a Table</h2>
        {restaurantName && <p className="text-slate-500 text-sm mt-1">{restaurantName}</p>}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Your full name" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Phone <span className="text-red-500">*</span></label>
          <input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="+250 7XX XXX XXX" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
            <input type="date" min={today} value={form.reservationDate} onChange={e => setForm(f => ({ ...f, reservationDate: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Time</label>
            <input type="time" value={form.reservationTime} onChange={e => setForm(f => ({ ...f, reservationTime: e.target.value }))} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Party Size</label>
          <input type="number" min={1} max={20} value={form.partySize} onChange={e => setForm(f => ({ ...f, partySize: Number(e.target.value) }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Special Requests</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Allergies, special occasions..." className={`${inputClass} resize-none`} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={saving} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold text-sm shadow-lg shadow-amber-500/30 hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-60">
          {saving ? 'Submitting...' : 'Request Reservation'}
        </button>
        <p className="text-center text-xs text-slate-400">You'll receive a WhatsApp confirmation once confirmed.</p>
      </form>
    </div>
  );
}

interface OnlineCustomerInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
}

function OnlineCustomerGate({ restaurantName, onSubmit }: { restaurantName?: string; onSubmit: (info: OnlineCustomerInfo) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Full name is required.'); return; }
    if (!phone.trim()) { setError('Phone number is required.'); return; }
    setError('');
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() });
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm";

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <GlobeIcon className="w-6 h-6 text-amber-500" />
          <h1 className="text-xl font-bold text-slate-900">Order Online</h1>
        </div>
        {restaurantName && (
          <p className="text-center text-slate-500 text-sm mb-6">{restaurantName}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number <span className="text-red-500">*</span></label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 7XX XXX XXX"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Delivery / Location Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, area or landmark"
              className={inputClass}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold text-sm shadow-lg shadow-amber-500/30 hover:from-amber-600 hover:to-amber-700 transition-all"
          >
            Continue to Menu →
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          Fields marked <span className="text-red-500">*</span> are required
        </p>
      </div>
    </div>
  );
}
interface CustomerAppProps {
  tableNumber: number;
  orders: Order[];
  restaurantName?: string;
  restaurantId?: string;
  onPlaceOrder: (
  tableNumber: number,
  items: CartItem[],
  specialInstructions?: string,
  customer?: Customer | null,
  delivery?: { provider: string; address: string },
  loyaltyRewardId?: string,
  promotionCode?: string
  )
  => Promise<void>;
  onCallWaiter: () => void;
}
type CustomerTab = 'menu' | 'cart' | 'orders' | 'reserve';

export function CustomerApp({
  tableNumber,
  orders,
  restaurantName,
  restaurantId,
  onPlaceOrder,
  onCallWaiter
}: CustomerAppProps) {
  const [activeTab, setActiveTab] = useState<CustomerTab>('menu');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [onlineCustomerInfo, setOnlineCustomerInfo] = useState<OnlineCustomerInfo | null>(null);

  const handleAddToCart = useCallback((
    item: MenuItem,
    quantity: number,
    selectedModifiers?: SelectedModifier[],
    adjustedUnitPrice?: number
  ) => {
    setCartItems((prev) => {
      const baseKey = getMenuItemCartKey(item as any);
      // Items with modifiers are always a new cart line (different customisations)
      if (selectedModifiers && selectedModifiers.length > 0) {
        const normalizedItem: MenuItem = { ...item, id: baseKey };
        return [...prev, { menuItem: normalizedItem, quantity, selectedModifiers, adjustedUnitPrice }];
      }
      const existingIndex = prev.findIndex(
        (ci) => getMenuItemCartKey(ci.menuItem as any) === baseKey && !ci.selectedModifiers?.length
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + quantity };
        return updated;
      }
      const normalizedItem: MenuItem = { ...item, id: baseKey };
      return [...prev, { menuItem: normalizedItem, quantity }];
    });
  }, []);
  const handleUpdateQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (quantity <= 0) {
        setCartItems((prev) =>
        prev.filter((item) => getMenuItemCartKey(item.menuItem as any) !== itemId)
        );
      } else {
        setCartItems((prev) =>
        prev.map((item) =>
        getMenuItemCartKey(item.menuItem as any) === itemId ?
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
    setCartItems((prev) => prev.filter((item) => getMenuItemCartKey(item.menuItem as any) !== itemId));
  }, []);
  const handleConfirmOrder = useCallback(
    async (
      specialInstructions: string,
      customer?: Customer | null,
      delivery?: { provider: string; address: string },
      loyaltyRewardId?: string,
      promotionCode?: string
    ): Promise<void> => {
      if (typeof onPlaceOrder !== 'function') {
        console.error('onPlaceOrder prop is missing or not a function');
        throw new Error('Order placement is not available. Please refresh and try again.');
      }
      const mergedCustomer: any = onlineCustomerInfo
        ? {
            ...(customer || {}),
            name: onlineCustomerInfo.name,
            customerName: onlineCustomerInfo.name,
            customerPhone: onlineCustomerInfo.phone,
            customerEmail: onlineCustomerInfo.email,
            customerAddress: onlineCustomerInfo.address,
          }
        : customer;
      await onPlaceOrder(tableNumber, cartItems, specialInstructions, mergedCustomer, delivery, loyaltyRewardId, promotionCode);
      setCartItems([]);
      setActiveTab('orders');
    },
    [tableNumber, cartItems, onPlaceOrder, onlineCustomerInfo]
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
  },
  {
    id: 'reserve' as const,
    label: 'Reserve',
    icon: CalendarIcon
  }];

  // Gate: all hooks above are always called; gate is in the render path, not before hooks
  if (tableNumber === 999 && !onlineCustomerInfo) {
    return (
      <OnlineCustomerGate
        restaurantName={restaurantName}
        onSubmit={setOnlineCustomerInfo}
      />
    );
  }

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
      <AnimatePresence mode="sync">
        <motion.div
          key={activeTab}
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            duration: 0.15
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
            restaurantId={restaurantId || localStorage.getItem('restaurantId') || undefined}
          />

          }
          {activeTab === 'orders' &&
          <OrderStatusPage orders={orders} tableNumber={tableNumber} />
          }
          {activeTab === 'reserve' &&
          <ReservationBookingForm restaurantId={restaurantId || localStorage.getItem('restaurantId') || undefined} restaurantName={restaurantName} />
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