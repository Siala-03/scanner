import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardListIcon,
  CheckCircleIcon,
  UtensilsIcon,
  BellIcon,
  DollarSignIcon,
  LogOutIcon,
  QrCodeIcon,
  SmartphoneIcon,
  WineIcon,
  StarIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PrinterIcon,
  ShareIcon,
} from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import { Order, Staff, CartItem, OrderItem } from '../../types';
import { QRScanner } from '../../components/waiter/QRScanner';
import { WaiterOrderEntry } from '../../components/waiter/WaiterOrderEntry';
import { loadReviews } from '../../utils/reviewsStorage';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { buildReceiptHtml, orderToReceiptData } from '../../utils/receipt';
import { printReceiptNetwork } from '../../api/printer';
import { ReceiptShareModal } from '../../components/ui/ReceiptShareModal';
import { supabaseAdmin } from '../../lib/supabase';

// ─── Kitchen detection ────────────────────────────────────────────────────────
const DRINK_CATEGORIES = new Set([
  'alcoholic-drinks', 'beers', 'wine', 'soft-drinks', 'coffee',
  'tea', 'juices', 'cocktails', 'mocktails', 'non-alcoholic', 'water',
]);

function itemNeedsKitchen(item: OrderItem): boolean {
  if (item.menuItem?.requiresKitchen === true) return true;
  if (item.menuItem?.requiresKitchen === false) return false;
  const cat = String(item.menuItem?.category ?? '').toLowerCase();
  return !cat || !DRINK_CATEGORIES.has(cat);
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface RestaurantInfo {
  logo?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
}

interface WaiterDashboardProps {
  waiter: Staff;
  orders: Order[];
  restaurantName?: string;
  restaurantInfo?: RestaurantInfo;
  onUpdateOrderStatus: (
    orderId: string,
    status: 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled',
    opts?: { assignedWaiterId?: string }
  ) => void;
  onCreateOrder?: (tableNumber: number, items: CartItem[], notes?: string) => Promise<void>;
  waiterCalls?: { tableNumber: number; timestamp: Date }[];
  onDismissWaiterCall?: (tableNumber: number) => void;
  onLogout?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'verified': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'preparing': return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'ready': return 'bg-green-500/15 text-green-300 border-green-500/30';
    case 'served': return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    case 'cancelled': return 'bg-red-500/15 text-red-300 border-red-500/30';
    default: return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

function isSameDay(value: Date | string | undefined, today: Date): boolean {
  if (!value) return false;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.toDateString() === today.toDateString();
}

function OverviewStatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className={`mt-2 text-lg font-bold sm:text-xl ${tone}`}>{value}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300">
          {icon}
        </div>
      </div>
    </div>
  );
}

function PortalSectionHeader({
  title,
  description,
  count,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-white sm:text-lg">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className={`inline-flex items-center self-start rounded-full border px-3 py-1.5 text-sm font-semibold ${tone}`}>
        {count} order{count !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ─── Inline Order Verification Card ──────────────────────────────────────────
function IncomingOrderCard({
  order,
  onApprove,
  onReject,
}: {
  order: Order;
  onApprove: (order: Order) => void;
  onReject: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isQROrder = !order.assignedWaiterId;
  const kitchenItems = order.items.filter(itemNeedsKitchen);
  const barItems = order.items.filter((i) => !itemNeedsKitchen(i));
  const hasKitchenItems = kitchenItems.length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60 }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-lg border border-slate-700 bg-slate-800"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
      {/* Card Header — always visible */}
      <button
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors group-hover:bg-slate-800/40 sm:items-center"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Table badge */}
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10">
            <span className="text-amber-300 font-bold text-sm">T{order.tableNumber ?? '–'}</span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-white">Table {order.tableNumber ?? '—'}</span>
              {isQROrder && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/30">
                  <SmartphoneIcon className="w-3 h-3" />
                  QR Menu
                </span>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${hasKitchenItems ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-purple-500/15 text-purple-300 border-purple-500/30'}`}>
                {hasKitchenItems ? (
                  <><UtensilsIcon className="w-3 h-3 mr-1" />Food + Bar</>
                ) : (
                  <><WineIcon className="w-3 h-3 mr-1" />Bar only</>
                )}
              </span>
            </div>
            <p className="text-sm text-slate-400 sm:truncate">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatPrice(order.total)} · {timeAgo(order.createdAt)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">Needs confirmation</span>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                {isQROrder ? 'Customer self-order' : 'Staff-assisted order'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {expanded ? (
            <ChevronUpIcon className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded verification panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-slate-700/80 px-4 pb-4 pt-4">
              {/* Verification prompt */}
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <BellIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200">
                  Confirm this order with the customer before approving.{' '}
                  {hasKitchenItems
                    ? 'Food items will be sent to the kitchen as a KOT.'
                    : 'This is a bar-only order — it will be marked ready immediately.'}
                </p>
              </div>

              {/* Kitchen items */}
              {kitchenItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <UtensilsIcon className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-semibold text-orange-300">Kitchen (KOT)</span>
                  </div>
                  <div className="space-y-1.5">
                    {kitchenItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm px-2">
                        <span className="text-slate-200">
                          {item.quantity}× {item.menuItem?.name ?? item.menuItemName ?? 'Unknown'}
                        </span>
                        <span className="text-slate-400">{formatPrice((item.unitPrice ?? 0) * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bar items */}
              {barItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <WineIcon className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-purple-300">Bar</span>
                  </div>
                  <div className="space-y-1.5">
                    {barItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm px-2">
                        <span className="text-slate-200">
                          {item.quantity}× {item.menuItem?.name ?? item.menuItemName ?? 'Unknown'}
                        </span>
                        <span className="text-slate-400">{formatPrice((item.unitPrice ?? 0) * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {(order.notes || order.specialInstructions) && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm text-yellow-200">
                  <span className="font-medium">Note: </span>
                  {order.notes || order.specialInstructions}
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center pt-1 border-t border-slate-700">
                <span className="text-slate-400 text-sm">Total</span>
                <span className="text-amber-300 font-bold text-lg">{formatPrice(order.total)}</span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button
                  onClick={() => onReject(order.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors font-medium text-sm"
                >
                  <XCircleIcon className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={() => onApprove(order)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors font-semibold text-sm"
                >
                  {hasKitchenItems ? (
                    <><UtensilsIcon className="w-4 h-4" />Verify & Send to Kitchen</>
                  ) : (
                    <><CheckCircleIcon className="w-4 h-4" />Verify & Mark Ready</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Kitchen/Ready/Served Order Row ──────────────────────────────────────────
function ActiveOrderRow({
  order,
  onMarkReady,
  onMarkServed,
  onPrintReceipt,
  onShare,
}: {
  order: Order;
  onMarkReady?: (id: string) => void;
  onMarkServed?: (id: string) => void;
  onPrintReceipt?: (order: Order) => void;
  onShare?: (order: Order) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60 }}
      whileHover={{ y: -2 }}
      className="group overflow-hidden rounded-lg border border-slate-700 bg-slate-800"
    >
      <button
        className="flex w-full items-start justify-between gap-3 p-4 text-left sm:items-center"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-700/70">
            <span className="text-white font-bold text-sm">T{order.tableNumber ?? '–'}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-white">Table {order.tableNumber ?? '—'}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(order.status)}`}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
              {order.requiresKitchen && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 text-xs border border-orange-500/20">
                  <UtensilsIcon className="w-3 h-3" />KOT
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatPrice(order.total)} · {timeAgo(order.createdAt)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                {order.requiresKitchen ? 'Kitchen tracked' : 'Service only'}
              </span>
              {order.assignedWaiterId && (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                  Assigned to you
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Quick action buttons — stop propagation so expanding doesn't trigger */}
          <div className="hidden gap-2 sm:flex" onClick={(e) => e.stopPropagation()}>
            {(order.status === 'verified' || order.status === 'preparing') && onMarkReady && (
              <button
                onClick={() => onMarkReady(order.id)}
                className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 text-xs font-semibold border border-green-500/30 transition-colors"
              >
                Mark Ready
              </button>
            )}
            {order.status === 'ready' && onMarkServed && (
              <button
                onClick={() => onMarkServed(order.id)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 text-xs font-semibold transition-colors"
              >
                Mark Served
              </button>
            )}
            {onPrintReceipt && (
              <button
                onClick={() => onPrintReceipt(order)}
                className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-medium border border-slate-600 transition-colors flex items-center gap-1"
              >
                <PrinterIcon className="w-3 h-3" />
                Receipt
              </button>
            )}
          </div>
          {expanded ? <ChevronUpIcon className="w-4 h-4 text-slate-400" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-slate-700/80 px-4 pb-4 pt-4">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-200">
                    {item.quantity}× {item.menuItem?.name ?? item.menuItemName ?? 'Unknown'}
                    {item.specialInstructions && (
                      <span className="text-slate-500 ml-1">({item.specialInstructions})</span>
                    )}
                  </span>
                  <span className="text-slate-400">{formatPrice((item.unitPrice ?? 0) * item.quantity)}</span>
                </div>
              ))}
              {(order.notes || order.specialInstructions) && (
                <p className="text-xs text-yellow-300 pt-1">Note: {order.notes || order.specialInstructions}</p>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-slate-400 text-sm">Total</span>
                <span className="text-amber-300 font-bold">{formatPrice(order.total)}</span>
              </div>
              <div className="flex flex-col gap-2 sm:hidden">
                {(order.status === 'verified' || order.status === 'preparing') && onMarkReady && (
                  <button
                    onClick={() => onMarkReady(order.id)}
                    className="w-full px-3 py-2.5 rounded-xl bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm font-semibold border border-green-500/30 transition-colors"
                  >
                    Mark Ready
                  </button>
                )}
                {order.status === 'ready' && onMarkServed && (
                  <button
                    onClick={() => onMarkServed(order.id)}
                    className="w-full px-3 py-2.5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 text-sm font-semibold transition-colors"
                  >
                    Mark Served
                  </button>
                )}
                {onPrintReceipt && (
                  <button
                    onClick={() => onPrintReceipt(order)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm transition-colors"
                  >
                    <PrinterIcon className="w-4 h-4" />
                    Print Receipt
                  </button>
                )}
              </div>
              {order.status === 'served' && onShare && (
                <button
                  onClick={() => onShare(order)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm transition-colors"
                >
                  <ShareIcon className="w-4 h-4" />
                  Share Receipt
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabButton({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {dot && !active && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-slate-900" />
      )}
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${active ? 'bg-slate-900/20 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyTab({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 text-slate-500">
        {icon}
      </div>
      <p className="font-semibold text-slate-400 mb-1">{title}</p>
      <p className="text-sm text-slate-500 max-w-xs">{desc}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WaiterDashboard({
  waiter,
  orders,
  restaurantName,
  restaurantInfo,
  onUpdateOrderStatus,
  onCreateOrder,
  waiterCalls = [],
  onDismissWaiterCall,
  onLogout,
}: WaiterDashboardProps) {
  const [portalPage, setPortalPage] = useState<'orders' | 'analytics'>('orders');
  const [activeTab, setActiveTab] = useState<'incoming' | 'kitchen' | 'ready' | 'served'>('incoming');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [socketCalls, setSocketCalls] = useState<{ tableNumber: number; timestamp: Date }[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedOrderForShare, setSelectedOrderForShare] = useState<Order | null>(null);
  // Track order IDs we've already seen so we can detect truly new ones
  const knownOrderIdsRef = useRef<Set<string>>(new Set());

  const { kpis } = useStaffKPIs();

  // ── Derive waiter-call notifications from new pending orders (polling-safe) ──
  useEffect(() => {
    const now = Date.now();
    orders
      .filter((o) => o.status === 'pending')
      .forEach((order) => {
        if (knownOrderIdsRef.current.has(order.id)) return;
        if (order.tableNumber == null) return;
        const tableNumber = order.tableNumber;
        // Only notify for orders placed in the last 90 seconds so the initial
        // load of old pending orders doesn't spam the waiter with stale alerts.
        const ageMs = now - new Date(order.createdAt).getTime();
        if (ageMs < 90_000) {
          setSocketCalls((prev) => {
            const alreadyHas = prev.some((c) => c.tableNumber === tableNumber);
            if (alreadyHas) return prev;
            return [...prev, { tableNumber, timestamp: new Date(order.createdAt) }];
          });
        }
      });
    // Mark every order ID as seen regardless of status/age
    orders.forEach((o) => knownOrderIdsRef.current.add(o.id));
  }, [orders]);

  // ── Supabase Realtime broadcast: "Call Waiter" button (explicit, no order) ──
  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;

    const channel = supabaseAdmin
      .channel(`waiter-calls-${restaurantId}`)
      .on('broadcast', { event: 'waiter:call' }, (payload) => {
        const data = payload.payload as { tableNumber: number; timestamp: string };
        setSocketCalls((prev) => {
          const alreadyHas = prev.some((c) => c.tableNumber === data.tableNumber);
          if (alreadyHas) return prev;
          return [...prev, { tableNumber: data.tableNumber, timestamp: new Date(data.timestamp) }];
        });
      })
      .subscribe();

    return () => { supabaseAdmin.removeChannel(channel); };
  }, []);

  // ── Order buckets ──
  const incomingOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending').sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
    [orders]
  );
  const kitchenOrders = useMemo(
    () => orders.filter((o) => o.status === 'verified' || o.status === 'preparing'),
    [orders]
  );
  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === 'ready'),
    [orders]
  );
  const servedOrders = useMemo(
    () => orders.filter((o) => o.status === 'served').sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [orders]
  );

  const todayServedOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((o) =>
      o.status === 'served' &&
      (isSameDay(o.servedAt as any, today) || isSameDay(o.updatedAt as any, today) || isSameDay(o.createdAt as any, today))
    );
  }, [orders]);

  // Stats
  const todaysRevenue = useMemo(
    () =>
      todayServedOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    [todayServedOrders]
  );

  const waiterReviews = useMemo(
    () => loadReviews().filter((r) => r.waiterId === waiter.id),
    [waiter.id]
  );
  const avgRating =
    waiterReviews.length > 0
      ? Math.round((waiterReviews.reduce((s, r) => s + r.rating, 0) / waiterReviews.length) * 10) / 10
      : null;

  // Merge waiter calls
  const allWaiterCalls = useMemo(() => {
    const map = new Map<number, Date>();
    socketCalls.forEach((c) => map.set(c.tableNumber, c.timestamp));
    waiterCalls.forEach((c) => { if (!map.has(c.tableNumber)) map.set(c.tableNumber, c.timestamp); });
    return Array.from(map.entries()).map(([tableNumber, timestamp]) => ({ tableNumber, timestamp }));
  }, [waiterCalls, socketCalls]);

  // ── Handlers ──
  const handleApprove = (order: Order) => {
    const nextStatus = order.requiresKitchen ? 'verified' : 'ready';
    onUpdateOrderStatus(order.id, nextStatus, { assignedWaiterId: waiter.id });
  };

  const handleReject = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'cancelled', { assignedWaiterId: waiter.id });
  };

  const handleMarkReady = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'ready', { assignedWaiterId: waiter.id });
  };

  const handleMarkServed = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'served', { assignedWaiterId: waiter.id });
  };

  const handlePrintReceipt = async (order: Order) => {
    try {
      await printReceiptNetwork(order, waiter.name);
    } catch (_e) { /* fallback below */ }
    try {
      const html = buildReceiptHtml(
        orderToReceiptData(order, {
          restaurantName: restaurantName || 'Company',
          restaurantAddress: restaurantInfo?.address || '',
          restaurantPhone: restaurantInfo?.phone || '',
          restaurantEmail: restaurantInfo?.email || '',
          restaurantLogo: restaurantInfo?.logo,
          restaurantCity: restaurantInfo?.city,
          restaurantCountry: restaurantInfo?.country,
          taxRate: 18,
          serverName: waiter.name,
          orderType: order.deliveryAddress ? 'delivery' : 'dine-in',
          paymentMethod: 'Cash',
          paymentStatus: 'paid',
          amountPaid: order.total,
        })
      );
      const win = window.open('', '_blank', 'width=450,height=900');
      if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    } catch (_e) { window.print(); }
  };

  const handleShare = (order: Order) => {
    setSelectedOrderForShare(order);
    setShowShareModal(true);
  };

  const handleDismissCall = (tableNumber: number) => {
    setSocketCalls((prev) => prev.filter((c) => c.tableNumber !== tableNumber));
    onDismissWaiterCall?.(tableNumber);
  };

  // Auto-switch to incoming tab when a new order arrives
  useEffect(() => {
    if (incomingOrders.length > 0 && activeTab !== 'incoming') {
      // Don't auto-switch — just pulse the tab indicator (handled by `dot` prop)
    }
  }, [incomingOrders.length, activeTab]);

  return (
    <div className="dark min-h-screen bg-slate-900 text-slate-100 pb-24 sm:pb-8">
      {/* ── Header ── */}
      <div className="sticky top-0 z-50 border-b border-slate-700 bg-slate-800/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          {/* Top row */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {restaurantInfo?.logo && (
                  <img src={restaurantInfo.logo} alt="logo" className="h-7 w-auto object-contain rounded" />
                )}
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold uppercase tracking-widest">
                  {restaurantName || 'Company'}
                </span>
                <span className="text-xs text-slate-400">· Waiter Portal</span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  {waiter.name.split(' ')[0]}'s service desk
                </h1>
                <p className="text-sm text-slate-400">
                  {portalPage === 'orders'
                    ? `${incomingOrders.length} incoming · ${readyOrders.length} ready to serve`
                    : `${todayServedOrders.length} served · ${formatPrice(todaysRevenue)} revenue`}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">Assigned tables: {waiter.assignedTables?.length || 0}</span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">Status: on shift</span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              {/* Take table order */}
              <button
                onClick={() => setShowQRScanner(true)}
                className="hidden items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-400 sm:flex"
              >
                <QrCodeIcon className="w-4 h-4" />
                <span>Take Order</span>
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-slate-700/60 text-slate-200 hover:bg-red-600 hover:text-white transition-colors"
                title="Logout"
              >
                <LogOutIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Connection status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-emerald-400">Live — receiving customer orders</span>
          </div>

          {/* Primary pages */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPortalPage('orders')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                portalPage === 'orders'
                  ? 'bg-amber-500 text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setPortalPage('analytics')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                portalPage === 'analytics'
                  ? 'bg-amber-500 text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              Analytics
            </button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OverviewStatCard
              icon={<ClipboardListIcon className="h-4 w-4" />}
              label="Incoming"
              value={incomingOrders.length}
              tone="text-amber-300"
            />
            <OverviewStatCard
              icon={<UtensilsIcon className="h-4 w-4" />}
              label="Kitchen"
              value={kitchenOrders.length}
              tone="text-blue-300"
            />
            <OverviewStatCard
              icon={<CheckCircleIcon className="h-4 w-4" />}
              label="Ready"
              value={readyOrders.length}
              tone="text-green-300"
            />
            <OverviewStatCard
              icon={<DollarSignIcon className="h-4 w-4" />}
              label="Today's Revenue"
              value={formatPrice(todaysRevenue)}
              tone="text-emerald-300"
            />
          </div>
        </div>
      </div>

      {/* ── Waiter Calls ── */}
      {allWaiterCalls.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pt-4 space-y-2">
          {allWaiterCalls.map((call) => (
            <div
              key={call.tableNumber}
              className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <BellIcon className="w-5 h-5 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-200">Customer assistance needed</p>
                  <p className="text-xs text-slate-400">Table {call.tableNumber} · {timeAgo(call.timestamp)}</p>
                </div>
              </div>
              <button
                onClick={() => handleDismissCall(call.tableNumber)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-6xl px-4 py-5">
        {portalPage === 'orders' ? (
          <div className="space-y-4">
            {/* Order status tabs */}
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <div className="flex min-w-max gap-2">
                <TabButton
                  label="Incoming"
                  count={incomingOrders.length}
                  active={activeTab === 'incoming'}
                  dot={incomingOrders.length > 0}
                  onClick={() => setActiveTab('incoming')}
                />
                <TabButton
                  label="In Kitchen"
                  count={kitchenOrders.length}
                  active={activeTab === 'kitchen'}
                  onClick={() => setActiveTab('kitchen')}
                />
                <TabButton
                  label="Ready"
                  count={readyOrders.length}
                  active={activeTab === 'ready'}
                  dot={readyOrders.length > 0}
                  onClick={() => setActiveTab('ready')}
                />
                <TabButton
                  label="Served"
                  count={servedOrders.length}
                  active={activeTab === 'served'}
                  onClick={() => setActiveTab('served')}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'incoming' && (
                <motion.div key="incoming" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                  <PortalSectionHeader
                    title="Incoming orders"
                    description="Confirm and route new customer orders before they enter the prep flow."
                    count={incomingOrders.length}
                    tone="border-amber-500/25 bg-amber-500/10 text-amber-200"
                  />
                  <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex items-start gap-3">
                    <SmartphoneIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-200">
                      New orders from the customer QR menu appear here. Expand each order, verify with the customer, then approve — food items are automatically sent to the kitchen as a KOT.
                    </p>
                  </div>
                  {incomingOrders.length === 0 ? (
                    <EmptyTab icon={<ClipboardListIcon className="w-7 h-7" />} title="No incoming orders" desc="Orders placed from the customer QR menu will appear here in real time." />
                  ) : (
                    <AnimatePresence>
                      {incomingOrders.map((order) => (
                        <IncomingOrderCard key={order.id} order={order} onApprove={handleApprove} onReject={handleReject} />
                      ))}
                    </AnimatePresence>
                  )}
                </motion.div>
              )}

              {activeTab === 'kitchen' && (
                <motion.div key="kitchen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                  <PortalSectionHeader
                    title="Kitchen follow-up"
                    description="Track verified food orders and promote them to ready as soon as the kitchen clears them."
                    count={kitchenOrders.length}
                    tone="border-orange-500/25 bg-orange-500/10 text-orange-200"
                  />
                  <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex items-start gap-3">
                    <UtensilsIcon className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-200">
                      These orders have been verified and sent to the kitchen. Click "Mark Ready" once the kitchen signals completion.
                    </p>
                  </div>
                  {kitchenOrders.length === 0 ? (
                    <EmptyTab icon={<UtensilsIcon className="w-7 h-7" />} title="Nothing in kitchen" desc="Food orders sent to the kitchen will appear here." />
                  ) : (
                    <AnimatePresence>
                      {kitchenOrders.map((order) => (
                        <ActiveOrderRow key={order.id} order={order} onMarkReady={handleMarkReady} onPrintReceipt={handlePrintReceipt} />
                      ))}
                    </AnimatePresence>
                  )}
                </motion.div>
              )}

              {activeTab === 'ready' && (
                <motion.div key="ready" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                  <PortalSectionHeader
                    title="Ready to serve"
                    description="Prioritize these orders for delivery and mark them served as soon as they reach the guest."
                    count={readyOrders.length}
                    tone="border-green-500/25 bg-green-500/10 text-green-200"
                  />
                  <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex items-start gap-3">
                    <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-200">
                      These orders are ready to be served. Click "Mark Served" once delivered to the table.
                    </p>
                  </div>
                  {readyOrders.length === 0 ? (
                    <EmptyTab icon={<CheckCircleIcon className="w-7 h-7" />} title="Nothing ready yet" desc="Orders ready to be served will appear here." />
                  ) : (
                    <AnimatePresence>
                      {readyOrders.map((order) => (
                        <ActiveOrderRow key={order.id} order={order} onMarkServed={handleMarkServed} onPrintReceipt={handlePrintReceipt} />
                      ))}
                    </AnimatePresence>
                  )}
                </motion.div>
              )}

              {activeTab === 'served' && (
                <motion.div key="served" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                  <PortalSectionHeader
                    title="Completed service"
                    description="Review delivered orders, reprint receipts, or share them with guests when needed."
                    count={servedOrders.length}
                    tone="border-slate-600 bg-slate-800/70 text-slate-200"
                  />
                  {servedOrders.length === 0 ? (
                    <EmptyTab icon={<StarIcon className="w-7 h-7" />} title="No served orders yet" desc="Completed orders from your shift appear here." />
                  ) : (
                    <AnimatePresence>
                      {servedOrders.map((order) => (
                        <ActiveOrderRow key={order.id} order={order} onPrintReceipt={handlePrintReceipt} onShare={handleShare} />
                      ))}
                    </AnimatePresence>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-lg font-bold text-amber-300">
                  {waiter.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active waiter</p>
                  <h3 className="truncate text-lg font-semibold text-white">{waiter.name}</h3>
                  <p className="text-sm text-slate-400">{avgRating != null ? `${avgRating} star service rating` : 'No rating yet for this shift'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Shift Summary</p>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-slate-400">Orders Served</span><span className="font-semibold text-white">{servedOrders.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Served Today</span><span className="font-semibold text-white">{todayServedOrders.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Incoming Orders</span><span className="font-semibold text-white">{incomingOrders.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Ready to Serve</span><span className="font-semibold text-white">{readyOrders.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Avg Service Time</span><span className="font-semibold text-white">{waiter.performance?.avgServiceTime ?? 15} min</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Revenue</span><span className="font-semibold text-emerald-300">{formatPrice(todaysRevenue)}</span></div>
              </div>
            </div>

            {kpis.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 md:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Daily Targets</p>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Live progress</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {kpis.map((kpi) => {
                    const current = kpi.progress?.currentValue ?? 0;
                    const target = kpi.target_value || 1;
                    const pct = Math.min(100, Math.round((current / target) * 100));
                    return (
                      <div key={kpi.id} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400 truncate max-w-[180px]">{kpi.name}</span>
                          <span className="font-semibold text-white ml-2">{current}/{target}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Customer Menu</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">Live sync active</span>
              </div>
              <p className="text-xs text-slate-500">Orders from QR code scans appear in Orders page instantly.</p>
              {incomingOrders.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2">
                  <BellIcon className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-200 font-medium">{incomingOrders.length} order{incomingOrders.length !== 1 ? 's' : ''} waiting</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showQRScanner && (
        <QRScanner
          onScan={(tableNumber) => {
            setShowQRScanner(false);
            setSelectedTableNumber(tableNumber);
            setShowOrderEntry(true);
          }}
          onClose={() => setShowQRScanner(false)}
          onError={(err) => { console.error('QR Scanner Error:', err); alert(err); }}
        />
      )}

      {showOrderEntry && selectedTableNumber !== null && (
        <WaiterOrderEntry
          tableNumber={selectedTableNumber}
          isOpen={showOrderEntry}
          onClose={() => { setShowOrderEntry(false); setSelectedTableNumber(null); }}
          onSubmitOrder={async (items, notes) => {
            if (!onCreateOrder) { alert('Order creation not available.'); return; }
            await onCreateOrder(selectedTableNumber, items, notes);
          }}
        />
      )}

      {showShareModal && selectedOrderForShare && (
        <ReceiptShareModal
          isOpen={showShareModal}
          onClose={() => { setShowShareModal(false); setSelectedOrderForShare(null); }}
          receipt={orderToReceiptData(selectedOrderForShare, {
            restaurantName: restaurantName || 'Company',
            restaurantAddress: restaurantInfo?.address || '',
            restaurantPhone: restaurantInfo?.phone || '',
            restaurantEmail: restaurantInfo?.email || '',
            restaurantLogo: restaurantInfo?.logo,
            restaurantCity: restaurantInfo?.city,
            restaurantCountry: restaurantInfo?.country,
            taxRate: 18,
            serverName: waiter.name,
            orderType: selectedOrderForShare.deliveryAddress ? 'delivery' : 'dine-in',
            paymentMethod: 'Cash',
            paymentStatus: 'paid',
            amountPaid: selectedOrderForShare.total,
          })}
        />
      )}

      <button
        onClick={() => setShowQRScanner(true)}
        className="fixed bottom-5 right-4 z-20 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_16px_40px_-18px_rgba(245,158,11,0.9)] transition-colors hover:bg-amber-400 sm:hidden"
      >
        <QrCodeIcon className="h-4 w-4" />
        Take Order
      </button>
    </div>
  );
}
