import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { OpenTabModal } from '../../components/shared/OpenTabModal';
import type { ConfirmMergeFn } from '../../hooks/useOrders';
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
  CalendarIcon,
  UsersIcon,
  ClockIcon,
  PencilIcon,
  XIcon,
} from 'lucide-react';
import { formatPrice } from '../../utils/currency';
import { Order, Staff, CartItem, OrderItem, Reservation } from '../../types';
import { getReservations, updateReservation } from '../../api/reservations';
import { requestOrderCancellation } from '../../api/orders';
import { QRScanner } from '../../components/waiter/QRScanner';
import { WaiterOrderEntry } from '../../components/waiter/WaiterOrderEntry';
import { loadReviews } from '../../utils/reviewsStorage';
import { useStaffKPIs } from '../../hooks/useKPIs';
import { orderToReceiptData, buildReceiptHtml, printReceipt } from '../../utils/receipt';
import type { PaymentEntry } from '../../utils/receipt';
import { ReceiptShareModal } from '../../components/ui/ReceiptShareModal';
import { PaymentCaptureModal } from '../../components/ui/PaymentCaptureModal';
import { supabase } from '../../lib/supabase';
import { markTableSessionPendingCloseFromReceipt } from '../../utils/tableSessions';
import { OnlineOrdersForWaiter } from '../../components/waiter/OnlineOrdersSection';
import { useTables } from '../../hooks/useTables';
import { OfflineBanner } from '../../components/ui/OfflineBanner';

// ─── Kitchen detection ────────────────────────────────────────────────────────
// Blacklist: these categories are bar/beverage only — everything else goes to kitchen.
const DRINK_CATEGORIES = new Set([
  'alcoholic-drinks', 'beers', 'wine', 'soft-drinks',
  'drinks', 'beverages', 'cocktails', 'bar',
]);
const SUPERVISOR_SOURCE_TAG = '[source:supervisor-take-order]';

function itemNeedsKitchen(item: OrderItem): boolean {
  if (item.menuItem?.requiresKitchen === false) return false; // explicitly bar-only
  if (item.menuItem?.requiresKitchen === true) return true;  // explicitly kitchen
  // Fall back to category: check stored category on item OR on menuItem
  const cat = String(
    item.menuItem?.category ?? (item as any).category ?? ''
  ).trim().toLowerCase();
  if (!cat || cat === 'unknown') return true; // unknown → assume kitchen
  return !DRINK_CATEGORIES.has(cat);
}

function hasSupervisorSourceTag(order: Order): boolean {
  const note = String(order.notes ?? '').toLowerCase();
  const special = String(order.specialInstructions ?? '').toLowerCase();
  return note.includes(SUPERVISOR_SOURCE_TAG) || special.includes(SUPERVISOR_SOURCE_TAG);
}

function cleanSourceTag(text: string | undefined): string {
  if (!text) return '';
  return text.split('\n').filter((line) => !line.toLowerCase().includes(SUPERVISOR_SOURCE_TAG)).join('\n').trim();
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
    opts?: { assignedWaiterId?: string; cancellationReason?: string; cancelledBy?: string }
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

function getSafeWaiterName(waiter: Staff): string {
  const rawName = (waiter as any)?.name;
  if (typeof rawName === 'string' && rawName.trim()) return rawName.trim();
  return 'Waiter';
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

function ComparisonBars({
  title,
  items,
  valueFormatter,
  emptyLabel,
  barColorClass,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  valueFormatter: (value: number) => string;
  emptyLabel: string;
  barColorClass: string;
}) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const width = Math.round((item.value / maxValue) * 100);
            return (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{item.label}</span>
                  <span className="font-semibold text-white">{valueFormatter(item.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColorClass}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const REJECT_REASONS = [
  'Customer changed mind',
  'Item out of stock',
  'Wrong order / entry error',
  'Duplicate order',
] as const;

// ─── Inline Order Verification Card ──────────────────────────────────────────
function IncomingOrderCard({
  order,
  onApprove,
  onReject,
  pendingCancel = false,
}: {
  order: Order;
  onApprove: (order: Order) => void;
  onReject: (orderId: string, reason: string) => Promise<void>;
  pendingCancel?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectMode, setRejectMode] = useState<'idle' | 'choosing' | 'typing'>('idle');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitRejection = async (reason: string) => {
    setSubmitting(true);
    try {
      await onReject(order.id, reason);
    } catch (_e) {
      // error handled in parent
    } finally {
      setSubmitting(false);
      setRejectMode('idle');
      setCustomReason('');
    }
  };
  const isQROrder = !order.assignedWaiterId;
  const supervisorAssigned = hasSupervisorSourceTag(order);
  const kitchenItems = order.items.filter(itemNeedsKitchen);
  const barItems = order.items.filter((i) => !itemNeedsKitchen(i));
  const hasKitchenItems = kitchenItems.length > 0;
  const isQueued = order.id.startsWith('offline-');

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
              {supervisorAssigned && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-300">
                  Assigned by supervisor
                </span>
              )}
              {isQueued && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  Queued offline
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 sm:truncate">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatPrice(order.total)} · {timeAgo(order.createdAt)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">Needs confirmation</span>
              {(order as any).paymentStatus === 'confirmed' || (order as any).payment_status === 'confirmed' ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  <CheckCircleIcon className="w-3 h-3" />Payment received
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300">
                  <ClockIcon className="w-3 h-3" />Payment pending
                </span>
              )}
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
              {rejectMode === 'choosing' ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Why are you cancelling?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {REJECT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => submitRejection(reason)}
                        disabled={submitting}
                        className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors text-sm font-medium text-center leading-tight disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {reason}
                      </button>
                    ))}
                    <button
                      onClick={() => setRejectMode('typing')}
                      disabled={submitting}
                      className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-slate-600 bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium col-span-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Other…
                    </button>
                  </div>
                  <button
                    onClick={() => setRejectMode('idle')}
                    disabled={submitting}
                    className="w-full py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              ) : rejectMode === 'typing' ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Specify reason</p>
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Describe why you're cancelling this order…"
                    rows={2}
                    autoFocus
                    disabled={submitting}
                    className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-red-500 placeholder-slate-500 disabled:opacity-40"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectMode('choosing')}
                      disabled={submitting}
                      className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => { if (!customReason.trim()) return; submitRejection(customReason.trim()); }}
                      disabled={!customReason.trim() || submitting}
                      className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? 'Sending…' : 'Request Cancellation'}
                    </button>
                  </div>
                </div>
              ) : pendingCancel ? (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm font-medium">
                  <ClockIcon className="w-4 h-4 flex-shrink-0" />
                  <span>Cancellation request sent — awaiting manager approval</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                  <button
                    onClick={() => setRejectMode('choosing')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors font-medium text-sm"
                  >
                    <XCircleIcon className="w-4 h-4" />
                    Request Cancel
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
              )}
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
  const supervisorAssigned = hasSupervisorSourceTag(order);
  const cleanedNote = cleanSourceTag(order.notes || order.specialInstructions);

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
              {supervisorAssigned && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 text-xs border border-cyan-500/25">
                  Assigned by supervisor
                </span>
              )}
              {(order as any).paymentStatus === 'confirmed' || (order as any).payment_status === 'confirmed' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs border border-emerald-500/20">
                  <CheckCircleIcon className="w-3 h-3" />Paid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs border border-amber-500/20">
                  <ClockIcon className="w-3 h-3" />Awaiting Payment
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
              {cleanedNote && (
                <p className="text-xs text-yellow-300 pt-1">Note: {cleanedNote}</p>
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
  const waiterName = getSafeWaiterName(waiter);
  type AnalyticsRange = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

  const [portalPage, setPortalPage] = useState<'orders' | 'analytics'>('orders');
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('weekly');
  const [activeTab, setActiveTab] = useState<'incoming' | 'kitchen' | 'ready' | 'served' | 'online'>('incoming');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [socketCalls, setSocketCalls] = useState<{ tableNumber: number; timestamp: Date }[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedOrderForShare, setSelectedOrderForShare] = useState<Order | null>(null);
  const [paymentCaptureOrder, setPaymentCaptureOrder] = useState<Order | null>(null);
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([]);
  const [reservationsExpanded, setReservationsExpanded] = useState(true);
  // Track order IDs we've already seen so we can detect truly new ones
  const knownOrderIdsRef = useRef<Set<string>>(new Set());

  // Occupied-table pre-check: stores the active order so the dialog can show its items
  const [confirmOccupied, setConfirmOccupied] = useState<{ tableNumber: number; activeOrder: Order } | null>(null);
  // Context passed into WaiterOrderEntry when adding to an existing order
  const [existingOrderForEntry, setExistingOrderForEntry] = useState<{ id: string; items: OrderItem[] } | null>(null);
  // null = ask user, true = auto-merge, false = auto-no-merge (set before opening order entry)
  const autoMergeRef = useRef<boolean | null>(null);

  // Open-tab merge modal state (fallback for unexpected merges)
  const [mergeCandidate, setMergeCandidate] = useState<Order | null>(null);
  const [pendingCancelRequests, setPendingCancelRequests] = useState<Set<string>>(new Set());
  const mergeResolveRef = useRef<((result: boolean) => void) | null>(null);

  const confirmMerge: ConfirmMergeFn = useCallback((candidate: Order) => {
    // Always check autoMergeRef first — covers both online and offline cases.
    if (autoMergeRef.current !== null) {
      const decision = autoMergeRef.current;
      autoMergeRef.current = null;
      return Promise.resolve(decision);
    }
    // Offline probe: candidate is null (no network, no real merge candidate found).
    // No pre-stored decision means this is a plain new order — don't merge.
    if (!candidate) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      setMergeCandidate(candidate);
      mergeResolveRef.current = resolve;
    });
  }, []);

  const findActiveOrderForTable = useCallback((tNum: number): Order | null => {
    return orders.find((o) => {
      const ps = o.paymentStatus ?? (o as any).payment_status;
      const tN = o.tableNumber ?? (o as any).table_number;
      return tN === tNum &&
        ['pending', 'verified', 'preparing', 'ready'].includes(o.status) &&
        ps !== 'confirmed';
    }) ?? null;
  }, [orders]);

  const { kpis } = useStaffKPIs();
  const { tables: allTables } = useTables();

  // Compute which tables have active orders from the live orders prop
  const tableOccupancy = useMemo(() => {
    const map: Record<number, 'occupied' | 'urgent'> = {};
    const now = Date.now();
    orders.forEach((o) => {
      if (!['pending', 'verified', 'preparing', 'ready'].includes(o.status)) return;
      const ps = o.paymentStatus ?? (o as any).payment_status;
      if (ps === 'confirmed') return;
      const tNum = o.tableNumber ?? (o as any).table_number;
      if (tNum == null || tNum === 999) return;
      const age = (now - new Date(o.createdAt).getTime()) / 60000;
      const next: 'occupied' | 'urgent' = age > 15 ? 'urgent' : 'occupied';
      if (!map[tNum] || (map[tNum] === 'occupied' && next === 'urgent')) map[tNum] = next;
    });
    return map;
  }, [orders]);

  // fetchOrders returns raw DB rows — check both camelCase and snake_case
  const isOnline = (o: Order) =>
    o.isOnlineOrder === true ||
    (o as any).is_online_order === true ||
    o.tableNumber === 999 ||
    (o as any).table_number === 999;

  const isAssignedToCurrentWaiter = useCallback((order: Order) => {
    const waiterIdStr = String(waiter.id).trim();
    if (!waiterIdStr) return false;
    return (
      String(order.assignedWaiterId ?? '').trim() === waiterIdStr ||
      String((order as any).assigned_waiter_id ?? '').trim() === waiterIdStr ||
      String((order as any).assigned_to ?? '').trim() === waiterIdStr ||
      // Ownership by creation — catches orders where assignment was never saved
      String((order as any).createdBy ?? '').trim() === waiterIdStr ||
      String((order as any).created_by ?? '').trim() === waiterIdStr
    );
  }, [waiter.id]);

  // ── Orders scoped to this waiter's assigned tables, excluding online (table 999) ──
  const myOrders = useMemo(() => {
    const assigned = waiter.assignedTables ?? [];
    const tableOrders = orders.filter((o) => !isOnline(o));

    if (assigned.length === 0) {
      // No explicit table assignments — show orders assigned to this waiter
      // AND orders that have no waiter assigned at all (e.g. supervisor-placed orders).
      return tableOrders.filter((o) => {
        if (isAssignedToCurrentWaiter(o)) return true;
        const w = String(
          o.assignedWaiterId ?? (o as any).assigned_waiter_id ?? (o as any).assigned_to ?? ''
        ).trim();
        return !w; // include unassigned orders so supervisor orders are visible
      });
    }

    // Has specific table assignments — show own orders + all orders for those tables
    return tableOrders.filter((o) => {
      if (isAssignedToCurrentWaiter(o)) return true;
      const tNum = o.tableNumber ?? (o as any).table_number;
      return tNum != null && assigned.includes(tNum);
    });
  }, [orders, waiter.assignedTables, isAssignedToCurrentWaiter]);

  // ── Derive waiter-call notifications from new pending orders (polling-safe) ──
  // Only notify about orders from this waiter's assigned tables.
  // (The "Call Waiter" broadcast below is separate and goes to ALL waiters.)
  useEffect(() => {
    const now = Date.now();
    const assigned = waiter.assignedTables ?? [];
    orders
      .filter((o) => o.status === 'pending')
      .forEach((order) => {
        if (knownOrderIdsRef.current.has(order.id)) return;
        if (order.tableNumber == null) return;
        // Skip if this table isn't assigned to us (unless we have no assignments)
        if (assigned.length > 0 && !assigned.includes(order.tableNumber)) return;
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
  }, [orders, waiter.assignedTables]);

  // ── Supabase Realtime broadcast: "Call Waiter" button (explicit, no order) ──
  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;

    const channel = supabase
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

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Load today's reservations ──
  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurantId');
    if (!restaurantId) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    getReservations(restaurantId, todayStr)
      .then((data) => setTodayReservations(data.filter((r) => !['cancelled', 'completed', 'no_show'].includes(r.status))))
      .catch(() => {});
  }, []);

  async function handleMarkSeated(reservation: Reservation) {
    try {
      const updated = await updateReservation(reservation.id, { status: 'seated' });
      setTodayReservations((prev) => prev.map((r) => r.id === reservation.id ? updated : r));
    } catch (_e) {}
  }

  function formatResTime(time?: string | null) {
    if (!time || typeof time !== 'string') return '—';
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return '—';
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
  }

  // ── Order buckets (scoped to this waiter's tables via myOrders) ──
  const incomingOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'pending').sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
    [myOrders]
  );
  const kitchenOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'verified' || o.status === 'preparing'),
    [myOrders]
  );
  const readyOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'ready'),
    [myOrders]
  );
  const servedOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'served').sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [myOrders]
  );

  const onlineOrders = useMemo(
    () => orders.filter((o) => isOnline(o) && o.status !== 'served' && o.status !== 'cancelled'),
    [orders]
  );

  const todayServedOrders = useMemo(() => {
    const today = new Date();
    return myOrders.filter((o) =>
      o.status === 'served' &&
      (isSameDay(o.servedAt as any, today) || isSameDay(o.updatedAt as any, today) || isSameDay(o.createdAt as any, today))
    );
  }, [myOrders]);

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
      ? Math.round(waiterReviews.reduce((s, r) => s + r.rating, 0) / waiterReviews.length)
      : null;

  const localWaiterKpiCurrent = useMemo(() => {
    const now = new Date();
    const waiterIdStr = String(waiter.id).trim();
    const servedRows = orders.filter((order) => {
      if (order.status !== 'served') return false;
      return (
        String(order.assignedWaiterId ?? '').trim() === waiterIdStr ||
        String((order as any).assigned_to ?? '').trim() === waiterIdStr ||
        String((order as any).created_by ?? '').trim() === waiterIdStr
      );
    });

    const getBounds = (period: 'daily' | 'weekly' | 'monthly') => {
      const start = new Date(now);
      const end = new Date(now);
      if (period === 'daily') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (period === 'weekly') {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
      } else {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
      }
      return { start, end };
    };

    const result = new Map<number, number>();
    kpis.forEach((kpi) => {
      if (String(kpi.staff_role).toLowerCase() !== 'waiter') return;
      const period = (kpi.period as 'daily' | 'weekly' | 'monthly') || 'daily';
      const { start, end } = getBounds(period);
      const rows = servedRows.filter((order) => {
        const when = new Date(order.servedAt ?? order.updatedAt ?? order.createdAt);
        if (Number.isNaN(when.getTime())) return false;
        return when >= start && when <= end;
      });

      let value = 0;
      if (kpi.metric === 'orders_served') {
        value = rows.length;
      } else if (kpi.metric === 'revenue') {
        value = rows.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
      } else if (kpi.metric === 'tables_served') {
        value = new Set(rows.map((order) => order.tableNumber)).size;
      }
      result.set(kpi.id, value);
    });

    return result;
  }, [orders, waiter.id, kpis]);

  const analyticsComparison = useMemo(() => {
    const servedOnly = myOrders.filter((o) => o.status === 'served');
    const now = new Date();

    const normalizeDate = (value: Date | string | undefined): Date => {
      const parsed = value ? new Date(value) : new Date();
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const sumRevenue = (rows: Order[]) =>
      rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);

    const startOfDay = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const ordersChart: Array<{ label: string; value: number }> = [];
    const revenueChart: Array<{ label: string; value: number }> = [];

    if (analyticsRange === 'weekly') {
      for (let i = 6; i >= 0; i -= 1) {
        const day = startOfDay(new Date(now));
        day.setDate(day.getDate() - i);
        const dayEnd = new Date(day);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const rows = servedOnly.filter((o) => {
          const when = normalizeDate(o.servedAt ?? o.updatedAt ?? o.createdAt);
          return when >= day && when < dayEnd;
        });
        const label = day.toLocaleDateString(undefined, { weekday: 'short' });
        ordersChart.push({ label, value: rows.length });
        revenueChart.push({ label, value: sumRevenue(rows) });
      }
    } else if (analyticsRange === 'monthly') {
      for (let i = 3; i >= 0; i -= 1) {
        const periodStart = startOfDay(new Date(now));
        periodStart.setDate(periodStart.getDate() - (i * 7 + 6));
        const periodEnd = startOfDay(new Date(now));
        periodEnd.setDate(periodEnd.getDate() - i * 7 + 1);
        const rows = servedOnly.filter((o) => {
          const when = normalizeDate(o.servedAt ?? o.updatedAt ?? o.createdAt);
          return when >= periodStart && when < periodEnd;
        });
        const label = `Week ${4 - i}`;
        ordersChart.push({ label, value: rows.length });
        revenueChart.push({ label, value: sumRevenue(rows) });
      }
    } else if (analyticsRange === 'quarterly') {
      for (let i = 2; i >= 0; i -= 1) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const rows = servedOnly.filter((o) => {
          const when = normalizeDate(o.servedAt ?? o.updatedAt ?? o.createdAt);
          return when >= monthStart && when < monthEnd;
        });
        const label = monthStart.toLocaleDateString(undefined, { month: 'short' });
        ordersChart.push({ label, value: rows.length });
        revenueChart.push({ label, value: sumRevenue(rows) });
      }
    } else {
      for (let i = 11; i >= 0; i -= 1) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const rows = servedOnly.filter((o) => {
          const when = normalizeDate(o.servedAt ?? o.updatedAt ?? o.createdAt);
          return when >= monthStart && when < monthEnd;
        });
        const label = monthStart.toLocaleDateString(undefined, { month: 'short' });
        ordersChart.push({ label, value: rows.length });
        revenueChart.push({ label, value: sumRevenue(rows) });
      }
    }

    return { ordersChart, revenueChart };
  }, [orders, analyticsRange]);

  const periodBarColorClass = useMemo(() => {
    switch (analyticsRange) {
      case 'weekly':
        return 'bg-sky-400';
      case 'monthly':
        return 'bg-emerald-400';
      case 'quarterly':
        return 'bg-violet-400';
      case 'yearly':
        return 'bg-amber-400';
      default:
        return 'bg-amber-400';
    }
  }, [analyticsRange]);

  // Merge waiter calls
  const allWaiterCalls = useMemo(() => {
    const map = new Map<number, Date>();
    socketCalls.forEach((c) => map.set(c.tableNumber, c.timestamp));
    waiterCalls.forEach((c) => { if (!map.has(c.tableNumber)) map.set(c.tableNumber, c.timestamp); });
    return Array.from(map.entries()).map(([tableNumber, timestamp]) => ({ tableNumber, timestamp }));
  }, [waiterCalls, socketCalls]);

  // ── Handlers ──
  const handleApprove = (order: Order) => {
    // If requiresKitchen is explicitly false → bar-only order, mark ready immediately.
    // For null/undefined (column may not exist), fall back to item-level check.
    // itemNeedsKitchen uses a drink-category blacklist so unknowns default to kitchen.
    const shouldRouteToKitchen =
      order.requiresKitchen === true ||
      (order.requiresKitchen !== false && order.items.some(itemNeedsKitchen));
    const nextStatus = shouldRouteToKitchen ? 'verified' : 'ready';
    onUpdateOrderStatus(order.id, nextStatus, { assignedWaiterId: waiter.id });
  };

  const handleReject = async (orderId: string, reason: string): Promise<void> => {
    await requestOrderCancellation(orderId, {
      reason,
      requestedBy: String(waiter.id),
      requestedByName: waiterName,
    });
    setPendingCancelRequests((prev) => new Set(prev).add(orderId));
  };

  const handleMarkReady = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'ready', { assignedWaiterId: waiter.id });
  };

  const handleMarkServed = (orderId: string) => {
    onUpdateOrderStatus(orderId, 'served', { assignedWaiterId: waiter.id });
  };

  const handlePrintReceipt = (order: Order) => {
    setPaymentCaptureOrder(order);
  };

  const handlePaymentConfirmed = async (payments: PaymentEntry[], change: number, receiptNote?: string) => {
    const order = paymentCaptureOrder;
    if (!order) return;
    setPaymentCaptureOrder(null);
    try {
      const combinedNotes = [cleanSourceTag(order.notes), receiptNote?.trim() || '']
        .filter(Boolean)
        .join('\n');
      const receiptData = orderToReceiptData(order, {
        restaurantName: restaurantName || 'Company',
        restaurantAddress: restaurantInfo?.address || '',
        restaurantPhone: restaurantInfo?.phone || '',
        restaurantEmail: restaurantInfo?.email || '',
        restaurantLogo: restaurantInfo?.logo,
        restaurantCity: restaurantInfo?.city,
        restaurantCountry: restaurantInfo?.country,
        taxRate: 0,
        serverName: waiterName,
        orderType: order.deliveryAddress ? 'delivery' : 'dine-in',
        payments,
        paymentStatus: 'paid',
        change,
        notes: combinedNotes || undefined,
      });
      try {
        printReceipt(buildReceiptHtml(receiptData));
      } catch {
        alert('Could not open print window. Please allow pop-ups in your browser.');
      }
      if (order.tableNumber != null) {
        await markTableSessionPendingCloseFromReceipt(order.tableNumber);
      }
    } catch (_e) {
      if (order.tableNumber != null) {
        await markTableSessionPendingCloseFromReceipt(order.tableNumber);
      }
    }
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
      {/* ── Offline / sync banner ── */}
      <OfflineBanner />

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
                  {waiterName.split(' ')[0]}'s service desk
                </h1>
                <p className="text-sm text-slate-400">
                  {portalPage === 'orders'
                    ? `${incomingOrders.length} incoming · ${readyOrders.length} ready to serve`
                    : `${todayServedOrders.length} served · ${formatPrice(todaysRevenue)} revenue`}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">
                  🍽️ Tables: {waiter.assignedTables && waiter.assignedTables.length > 0 
                    ? waiter.assignedTables.sort((a, b) => a - b).join(', ') 
                    : 'None assigned'}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">Status: on shift</span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              {/* Take order — QR scan */}
              <button
                onClick={() => setShowQRScanner(true)}
                className="hidden items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-400 sm:flex"
              >
                <QrCodeIcon className="w-4 h-4" />
                <span>QR Order</span>
              </button>
              {/* Take order — manual table pick */}
              <button
                onClick={() => setShowTablePicker(true)}
                className="hidden items-center gap-2 rounded-lg border border-slate-600 bg-slate-700 px-3.5 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-600 sm:flex"
              >
                <PencilIcon className="w-4 h-4" />
                <span>New Order</span>
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
            {/* ── Today's Reservations Panel ── */}
            {todayReservations.length > 0 && (
              <div className="rounded-lg border border-blue-500/25 bg-blue-500/8 overflow-hidden">
                <button
                  onClick={() => setReservationsExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-blue-200">Today's Reservations</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">{todayReservations.length}</span>
                  </div>
                  {reservationsExpanded ? <ChevronUpIcon className="w-4 h-4 text-slate-400" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400" />}
                </button>
                {reservationsExpanded && (
                  <div className="border-t border-blue-500/20 divide-y divide-slate-700/50">
                    {todayReservations.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-100">{r.customerName}</span>
                            {r.tableNumber && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">T{r.tableNumber}</span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              r.status === 'confirmed' ? 'bg-blue-900/40 text-blue-300' :
                              r.status === 'seated' ? 'bg-green-900/40 text-green-300' :
                              'bg-yellow-900/30 text-yellow-300'
                            }`}>{r.status}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1"><ClockIcon className="w-3 h-3" />{formatResTime(r.reservationTime)}</span>
                            <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{r.partySize} guests</span>
                          </div>
                        </div>
                        {r.status !== 'seated' && (
                          <button
                            onClick={() => handleMarkSeated(r)}
                            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
                          >
                            Seat
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                <TabButton
                  label="Online"
                  count={onlineOrders.length}
                  active={activeTab === 'online'}
                  dot={onlineOrders.some((o) => o.status === 'pending')}
                  onClick={() => setActiveTab('online')}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'incoming' && (
                <motion.div key="incoming" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-base font-semibold text-white sm:text-lg">Incoming orders</h2>
                  </div>
                  {incomingOrders.length === 0 ? (
                    <EmptyTab icon={<ClipboardListIcon className="w-7 h-7" />} title="No incoming orders" desc="Orders placed from the customer QR menu will appear here in real time." />
                  ) : (
                    <AnimatePresence>
                      {incomingOrders.map((order) => (
                        <IncomingOrderCard key={order.id} order={order} onApprove={handleApprove} onReject={handleReject} pendingCancel={pendingCancelRequests.has(order.id)} />
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

              {activeTab === 'online' && (
                <motion.div key="online" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                  <PortalSectionHeader
                    title="Online orders"
                    description="Orders placed via QR code link. Pending orders await supervisor approval before going to the kitchen."
                    count={onlineOrders.length}
                    tone="border-blue-500/25 bg-blue-500/10 text-blue-200"
                  />
                  <OnlineOrdersForWaiter
                    orders={onlineOrders}
                    onUpdateStatus={(orderId, newStatus) =>
                      onUpdateOrderStatus(orderId, newStatus)
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-lg font-bold text-amber-300">
                  {waiterName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || 'W'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active waiter</p>
                  <h3 className="truncate text-lg font-semibold text-white">{waiterName}</h3>
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

            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 md:col-span-2">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs uppercase tracking-widest text-slate-500">Simple Comparison</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: 'weekly', label: 'Weekly' },
                      { key: 'monthly', label: 'Monthly' },
                      { key: 'quarterly', label: 'Quarterly' },
                      { key: 'yearly', label: 'Yearly' },
                    ] as Array<{ key: AnalyticsRange; label: string }>
                  ).map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setAnalyticsRange(option.key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        analyticsRange === option.key
                          ? 'bg-amber-500 text-slate-900'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-4 text-sm text-slate-400">Bars make it easy to compare performance at a glance.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <ComparisonBars
                  title="Orders Served"
                  items={analyticsComparison.ordersChart}
                  valueFormatter={(value) => String(value)}
                  emptyLabel="No served orders yet."
                  barColorClass={periodBarColorClass}
                />
                <ComparisonBars
                  title="Revenue"
                  items={analyticsComparison.revenueChart}
                  valueFormatter={(value) => formatPrice(value)}
                  emptyLabel="No revenue data yet."
                  barColorClass={periodBarColorClass}
                />
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
                    const apiCurrent = kpi.progress?.currentValue ?? 0;
                    const localCurrent = localWaiterKpiCurrent.get(kpi.id) ?? 0;
                    const current = Math.max(apiCurrent, localCurrent);
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

          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {/* Manual table picker */}
      {showTablePicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">Select Table</h3>
                <p className="text-xs text-slate-400 mt-0.5">Pick a table to place an order manually</p>
              </div>
              <button onClick={() => setShowTablePicker(false)}>
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Legend */}
            <div className="mb-3 flex gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Free</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Occupied</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Urgent</span>
            </div>

            {/* Bar/Walk-up */}
            <button
              onClick={() => {
                setSelectedTableNumber(0);
                setShowTablePicker(false);
                setShowOrderEntry(true);
              }}
              className="mb-3 w-full rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/10 py-3 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              Bar / Walk-up (no table)
            </button>

            {/* Table grid */}
            <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto">
              {[...allTables].sort((a, b) => a - b).map((tNum) => {
                const status = tableOccupancy[tNum];
                const cls = status === 'urgent'
                  ? 'border-red-500 bg-red-500/15 text-red-200'
                  : status === 'occupied'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-200'
                    : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-emerald-500 hover:text-white';
                const dot = status === 'urgent' ? 'bg-red-400' : status === 'occupied' ? 'bg-amber-400' : 'bg-emerald-400';
                return (
                  <button
                    key={tNum}
                    onClick={() => {
                      if (status === 'occupied' || status === 'urgent') {
                        const activeOrder = findActiveOrderForTable(tNum);
                        setShowTablePicker(false);
                        if (activeOrder) {
                          setConfirmOccupied({ tableNumber: tNum, activeOrder });
                        } else {
                          setSelectedTableNumber(tNum);
                          setShowOrderEntry(true);
                        }
                      } else {
                        setExistingOrderForEntry(null);
                        autoMergeRef.current = null;
                        setSelectedTableNumber(tNum);
                        setShowTablePicker(false);
                        setShowOrderEntry(true);
                      }
                    }}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 py-3 font-bold text-sm transition-all ${cls}`}
                  >
                    <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${dot}`} />
                    {tNum}
                  </button>
                );
              })}
            </div>

            {allTables.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No tables configured</p>
            )}
          </div>
        </div>
      )}

      {showQRScanner && (
        <QRScanner
          onScan={(tableNumber) => {
            const activeOrder = findActiveOrderForTable(tableNumber);
            if (activeOrder) {
              setShowQRScanner(false);
              setConfirmOccupied({ tableNumber, activeOrder });
            } else {
              setExistingOrderForEntry(null);
              autoMergeRef.current = null;
              setShowQRScanner(false);
              setSelectedTableNumber(tableNumber);
              setShowOrderEntry(true);
            }
          }}
          onClose={() => setShowQRScanner(false)}
          onError={(err) => { console.error('QR Scanner Error:', err); alert(err); }}
        />
      )}

      {showOrderEntry && selectedTableNumber !== null && (
        <WaiterOrderEntry
          tableNumber={selectedTableNumber}
          isOpen={showOrderEntry}
          existingOrder={existingOrderForEntry}
          onClose={() => { setShowOrderEntry(false); setSelectedTableNumber(null); setExistingOrderForEntry(null); autoMergeRef.current = null; }}
          onSubmitOrder={async (items, notes) => {
            if (!onCreateOrder) { alert('Order creation not available.'); return; }
            // 0 = Bar/Walk-up (no table number) — pass as undefined via a special value
            if (selectedTableNumber === 0) {
              const { createOrder } = await import('../../api/orders');
              const staffId = localStorage.getItem('staffId') ||
                (() => { try { return JSON.parse(localStorage.getItem('authUser') || '{}')?.id; } catch { return null; } })();
              await createOrder({
                tableNumber: undefined,
                items: items.map((i) => ({
                  menuItemId: i.menuItem?.id ?? '',
                  menuItemName: i.menuItem?.name ?? '',
                  quantity: i.quantity,
                  unitPrice: i.menuItem?.price ?? 0,
                  notes: i.specialInstructions,
                })),
                notes: notes,
                createdBy: staffId ?? undefined,
              } as any);
            } else {
              // Extra args (confirmMerge) flow through as any — prop type stays simple
              await (onCreateOrder as any)(
                selectedTableNumber!,
                items,
                notes,
                undefined, undefined, undefined, undefined,
                confirmMerge,
              );
            }
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
            taxRate: 0,
            serverName: waiterName,
            orderType: selectedOrderForShare.deliveryAddress ? 'delivery' : 'dine-in',
            paymentMethod: 'Cash',
            paymentStatus: 'paid',
            amountPaid: selectedOrderForShare.total,
          })}
        />
      )}

      {paymentCaptureOrder && (
        <PaymentCaptureModal
          total={paymentCaptureOrder.total ?? 0}
          currency="RWF"
          onConfirm={handlePaymentConfirmed}
          onCancel={() => setPaymentCaptureOrder(null)}
        />
      )}

      {/* Occupied-table dialog — shows existing order and asks how to proceed */}
      {confirmOccupied !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-slate-700">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Active Order</p>
              </div>
              <h3 className="text-lg font-bold text-white">Table {confirmOccupied.tableNumber}</h3>
            </div>

            {/* Existing items */}
            <div className="px-5 py-3 max-h-52 overflow-y-auto">
              <p className="text-xs font-medium text-slate-500 mb-2">Items currently on this table:</p>
              <div className="space-y-1.5">
                {confirmOccupied.activeOrder.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-200 flex-1 truncate">{item.menuItemName || 'Item'}</span>
                    <span className="text-slate-500 shrink-0">×{item.quantity}</span>
                    <span className="text-slate-400 shrink-0 font-medium">{formatPrice((item.unitPrice || 0) * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-slate-700/60 flex justify-between text-sm font-semibold">
                <span className="text-slate-400">Order total</span>
                <span className="text-white">{formatPrice(confirmOccupied.activeOrder.total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 space-y-2">
              <button
                onClick={() => {
                  autoMergeRef.current = true;
                  setExistingOrderForEntry({
                    id: confirmOccupied.activeOrder.id,
                    items: confirmOccupied.activeOrder.items,
                  });
                  setSelectedTableNumber(confirmOccupied.tableNumber);
                  setShowOrderEntry(true);
                  setConfirmOccupied(null);
                }}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition-colors"
              >
                Add to this order
              </button>
              <button
                onClick={() => {
                  autoMergeRef.current = false;
                  setExistingOrderForEntry(null);
                  setSelectedTableNumber(confirmOccupied.tableNumber);
                  setShowOrderEntry(true);
                  setConfirmOccupied(null);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors"
              >
                Start a separate order
              </button>
              <button
                onClick={() => setConfirmOccupied(null)}
                className="w-full py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeCandidate && (
        <OpenTabModal
          tableNumber={mergeCandidate.tableNumber ?? (mergeCandidate as any).table_number ?? 0}
          candidate={mergeCandidate}
          onAddToTab={() => {
            mergeResolveRef.current?.(true);
            mergeResolveRef.current = null;
            setMergeCandidate(null);
          }}
          onNewOrder={() => {
            mergeResolveRef.current?.(false);
            mergeResolveRef.current = null;
            setMergeCandidate(null);
          }}
        />
      )}

      {/* Mobile FABs */}
      <div className="fixed bottom-5 right-4 z-20 flex flex-col gap-2 sm:hidden">
        <button
          onClick={() => setShowTablePicker(true)}
          className="flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-lg transition-colors hover:bg-slate-700"
        >
          <PencilIcon className="h-4 w-4" />
          New Order
        </button>
        <button
          onClick={() => setShowQRScanner(true)}
          className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_16px_40px_-18px_rgba(245,158,11,0.9)] transition-colors hover:bg-amber-400"
        >
          <QrCodeIcon className="h-4 w-4" />
          QR Order
        </button>
      </div>
    </div>
  );
}
