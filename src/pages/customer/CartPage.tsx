import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBagIcon, ArrowRightIcon, CheckCircleIcon, BellRingIcon, CheckIcon, TagIcon } from 'lucide-react';
import { CartItem, Customer, LoyaltySummary, Reward } from '../../types';
import { CartItemCard } from '../../components/customer/CartItem';
import { CustomerIdentification } from '../../components/customer/CustomerIdentification';
import { Button } from '../../components/ui/Button';
import { getCustomerDetails } from '../../api/loyalty';
import { validatePromoCode, ValidatePromoResult } from '../../api/promotions';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';

interface CartPageProps {
  cartItems: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onPlaceOrder: (
    specialInstructions: string,
    customer?: Customer | null,
    delivery?: { provider: string; address: string },
    loyaltyRewardId?: string,
    promotionCode?: string
  ) => Promise<void>;
  tableNumber: number;
  onCallWaiter: () => void;
  restaurantId?: string;
}
export function CartPage({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  tableNumber,
  onCallWaiter,
  restaurantId,
}: CartPageProps) {
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryProvider, setDeliveryProvider] = useState<'vubavuba' | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [identifiedCustomer, setIdentifiedCustomer] = useState<Customer | null>(null);
  const [loyaltySummary, setLoyaltySummary] = useState<LoyaltySummary | null>(null);
  const [appliedReward, setAppliedReward] = useState<Reward | null>(null);
  const [rewardMessage, setRewardMessage] = useState('');
  const [rewardError, setRewardError] = useState('');
  const [waiterCalled, setWaiterCalled] = useState(false);
  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<ValidatePromoResult | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  const subtotal = cartItems.reduce(
    (sum, item) => sum + (item.adjustedUnitPrice ?? getEffectivePrice(item.menuItem)) * item.quantity,
    0
  );
  const loyaltyDiscount = appliedReward?.rewardType === 'discount' && appliedReward.discountPercentage
    ? Math.round((subtotal * appliedReward.discountPercentage) / 100)
    : 0;
  const promoDiscount = promoResult?.discountAmount ?? 0;
  const adjustedTotal = Math.max(0, subtotal - loyaltyDiscount - promoDiscount);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const result = await validatePromoCode(promoCode.trim(), restaurantId || '', subtotal);
      setPromoResult(result);
    } catch (err: any) {
      setPromoError(err?.message || 'Invalid promo code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setPromoResult(null);
    setPromoError('');
  };

  useEffect(() => {
    async function loadLoyalty() {
      if (!identifiedCustomer?.id) {
        setLoyaltySummary(null);
        setAppliedReward(null);
        return;
      }

      try {
        const details = await getCustomerDetails(identifiedCustomer.id);
        setLoyaltySummary(details);
        setRewardMessage('');
        setRewardError('');
      } catch (error) {
        console.warn('Failed to load loyalty summary', error);
      }
    }
    loadLoyalty();
  }, [identifiedCustomer]);

  const handleApplyReward = async (reward: Reward) => {
    if (!identifiedCustomer) {
      setRewardError('Please identify customer first.');
      return;
    }

    // Check if customer has enough points locally
    if (loyaltySummary && loyaltySummary.customer.totalPoints < reward.pointsRequired) {
      setRewardError('Insufficient points for this reward.');
      return;
    }

    // Just set the reward locally - redemption will happen during order creation
    setAppliedReward(reward);
    setRewardMessage(`Reward "${reward.name}" will be applied to your order.`);
    setRewardError('');
  };

  const handleCallWaiterClick = () => {
    if (waiterCalled) return;
    onCallWaiter();
    setWaiterCalled(true);
    setTimeout(() => {
      setWaiterCalled(false);
    }, 30000);
  };

  const handleSubmitOrder = async () => {
    setIsOrdering(true);
    setRewardError('');
    try {
      const delivery = isDelivery && deliveryProvider
        ? { provider: deliveryProvider, address: deliveryAddress }
        : undefined;
      await onPlaceOrder(specialInstructions, identifiedCustomer, delivery, appliedReward?.id, promoResult ? promoCode : undefined);
      setOrderPlaced(true);
    } catch (err) {
      console.error('Place order failed', err);
      setRewardError(err instanceof Error ? err.message : 'Unable to place order right now. Please try again.');
    } finally {
      setIsOrdering(false);
    }
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
        transition={{
          type: 'spring',
          delay: 0.2
        }}
        className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">

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
            className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/30">

            <CheckCircleIcon className="w-12 h-12 text-white" />
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
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <EmptyState
          icon={<ShoppingBagIcon className="w-10 h-10" />}
          title="Your cart is empty"
          description="Explore our exquisite menu and add your favorites." />

      </div>);

  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-48">
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Order</h1>
            <p className="text-sm text-slate-500 mt-1">Review your selections</p>
          </div>
          <span className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full text-sm font-semibold shadow-md shadow-amber-500/25">
            Table {tableNumber}
          </span>
        </div>

        {/* Cart items */}
        <div className="space-y-3 mb-6">
          {cartItems.map((item) =>
            <div key={item.menuItem.id}>
              <CartItemCard
                item={item}
                onUpdateQuantity={onUpdateQuantity}
                onRemove={onRemoveItem} />
            </div>
          )}
        </div>

        {/* Customer identification for loyalty program */}
        <CustomerIdentification
          onCustomerIdentified={setIdentifiedCustomer}
          identifiedCustomer={identifiedCustomer}
          restaurantId={restaurantId}
        />

        {/* Loyalty program rewards */}
        {identifiedCustomer && loyaltySummary && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold text-slate-800">Loyalty Rewards</h2>
              <span className="text-sm text-slate-500">
                Points: {loyaltySummary.customer.totalPoints}
              </span>
            </div>

            {rewardMessage && <p className="text-sm text-green-600 mb-2">{rewardMessage}</p>}
            {rewardError && <p className="text-sm text-red-600 mb-2">{rewardError}</p>}

            <div className="space-y-2">
              {loyaltySummary.availableRewards.length === 0 && (
                <p className="text-sm text-slate-500">No rewards available yet.</p>
              )}
              {loyaltySummary.availableRewards.map((reward) => {
                const eligible = loyaltySummary.customer.totalPoints >= reward.pointsRequired;
                return (
                  <div key={reward.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-slate-700">{reward.name}</p>
                      <p className="text-xs text-slate-500">{reward.description}</p>
                      <p className="text-xs text-slate-500">Requires {reward.pointsRequired} points</p>
                    </div>
                    <Button
                      variant={appliedReward?.id === reward.id ? 'secondary' : 'primary'}
                      disabled={!eligible}
                      onClick={() => handleApplyReward(reward)}
                    >
                      {appliedReward?.id === reward.id ? 'Applied' : 'Use'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Promo code */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <TagIcon className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-800">Promo Code</h2>
          </div>
          {promoResult ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="text-sm font-medium text-green-700">
                {promoResult.promotion.code} — {promoResult.promotion.type === 'percentage' ? `${promoResult.promotion.discountValue}% off` : `${formatPrice(promoResult.promotion.discountValue)} off`}
              </span>
              <button onClick={handleRemovePromo} className="text-xs text-red-500 hover:text-red-700 ml-3">Remove</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
                placeholder="Enter promo code"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
              />
              <Button
                variant="secondary"
                onClick={handleApplyPromo}
                isLoading={promoLoading}
                disabled={!promoCode.trim() || promoLoading}
              >
                Apply
              </Button>
            </div>
          )}
          {promoError && <p className="text-xs text-red-600 mt-2">{promoError}</p>}
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

        {/* Delivery options */}
        <div className="mb-6">
          <div className="w-full">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Delivery Method
            </label>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setIsDelivery(false);
                  setDeliveryProvider(null);
                  setDeliveryAddress('');
                }}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  !isDelivery
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
              >
                <div className="font-medium text-slate-900">Dine In - Table {tableNumber}</div>
                <div className="text-sm text-slate-500">Served at your table</div>
              </button>

              <button
                onClick={() => {
                  setIsDelivery(true);
                  setDeliveryProvider('vubavuba');
                }}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  isDelivery && deliveryProvider === 'vubavuba'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
              >
                <div className="font-medium text-slate-900">VubaVuba Delivery</div>
                <div className="text-sm text-slate-500">Fast delivery to your location</div>
              </button>
            </div>

            {isDelivery && deliveryProvider === 'vubavuba' && (
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Enter delivery address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order summary - fixed bottom */}
      <div className="fixed bottom-[72px] left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.08)] p-6 pb-8 z-40 border-t border-slate-100">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-slate-600">
            <span className="font-medium">Subtotal</span>
            <span className="font-semibold">{formatPrice(subtotal)}</span>
          </div>
          {appliedReward && appliedReward.rewardType === 'discount' && loyaltyDiscount > 0 && (
            <div className="flex justify-between text-amber-600">
              <span className="font-medium">Loyalty Discount ({appliedReward.discountPercentage}%)</span>
              <span className="font-semibold">-{formatPrice(loyaltyDiscount)}</span>
            </div>
          )}
          {promoResult && promoDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span className="font-medium">Promo: {promoResult.promotion.code}</span>
              <span className="font-semibold">-{formatPrice(promoDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Total</span>
            <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">{formatPrice(adjustedTotal)}</span>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSubmitOrder}
          isLoading={isOrdering}
        >
          Place Order
          <ArrowRightIcon className="w-5 h-5" />
        </Button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleCallWaiterClick}
          className={`w-full mt-3 px-5 py-3 rounded-xl shadow-lg flex items-center justify-center gap-2.5 transition-all duration-300 ${
            waiterCalled 
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-500/30' 
              : 'bg-gradient-to-r from-slate-600 to-slate-700 text-white hover:from-slate-700 hover:to-slate-800 shadow-slate-500/30 hover:shadow-slate-500/40'
          }`}
          animate={
            waiterCalled
              ? {}
              : {
                  boxShadow: [
                    '0px 0px 0px 0px rgba(100,116,139,0.4)',
                    '0px 0px 0px 10px rgba(100,116,139,0)',
                    '0px 0px 0px 0px rgba(100,116,139,0)'
                  ]
                }
          }
          transition={{
            repeat: Infinity,
            duration: 2
          }}
        >
          {waiterCalled ? (
            <>
              <CheckIcon className="w-5 h-5" />
              <span className="text-sm font-semibold">Waiter Notified</span>
            </>
          ) : (
            <>
              <BellRingIcon className="w-5 h-5" />
              <span className="text-sm font-semibold">Call Waiter</span>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
