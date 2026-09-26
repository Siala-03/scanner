
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeftIcon,
  PlusIcon,
  MinusIcon,
  ShoppingCartIcon,
  SearchIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  XIcon,
  PrinterIcon,
  ReceiptTextIcon,
  ClockIcon,
} from 'lucide-react';
import { useMenu } from '../../hooks/useMenu';
import { useTables } from '../../hooks/useTables';
import { useStaff } from '../../hooks/useStaff';
import { createOrder, requestOrderCancellation, findMergeableOpenOrder } from '../../api/orders';
import { findMergeableInOrders, normalizeOrderPayload } from '../../hooks/useOrders';
import { useOrdersContext } from '../../contexts/OrdersContext';
import { OpenTabModal } from '../../components/shared/OpenTabModal';
import { StaffPinModal } from '../../components/shared/StaffPinModal';
import { fetchPinHashes } from '../../utils/staffPin';
import { supabase } from '../../lib/supabase';
import { fetchKitchenOrders } from '../../api/orders';
import { formatPrice } from '../../utils/currency';
import { buildReceiptHtml, buildChitHtml, orderToReceiptData, printReceipt } from '../../utils/receipt';
import { markBillPresented, isBillPresented } from '../../utils/billTracking';
import { markTableSessionPendingCloseFromReceipt } from '../../utils/tableSessions';
import type { ReceiptData } from '../../utils/receipt';
import { printOrderReceipt as printThermal } from '../../utils/sunmiPrinter';
import { Modal } from '../../components/ui/Modal';
import { MenuItem, Order } from '../../types';

type TableStatus = 'free' | 'occupied' | 'urgent';

interface CartEntry {
  menuItemId: string;
  menuItemName: string;
  menuItem: MenuItem;
  quantity: number;
  unitPrice: number;
  notes: string;
}

interface StaffOrderPageProps {
  restaurantName?: string;
  restaurantInfo?: {
    logo?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    momoCode?: string;
    barChitEnabled?: boolean;
  };
  staffName?: string;
  sharedTerminalMode?: boolean;
  // Fired whenever a waiter is checked in/out of the shared terminal (a name is
  // selected, or "Switch Waiter" clears it) — lets the host page (e.g. the
  // supervisor nav) hide unrelated tabs while a waiter is actively using it.
  onActiveSessionChange?: (active: boolean) => void;
  onBack?: () => void;
}

interface StaffOption {
  id: string;
  name: string;
  role?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All Items',
  'alcoholic-drinks': 'Alcoholic',
  beers: 'Beers',
  wine: 'Wine',
  'soft-drinks': 'Soft Drinks',
  drinks: 'Drinks',
  beverages: 'Beverages',
  cocktails: 'Cocktails',
  bar: 'Bar',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  desserts: 'Desserts',
  specials: 'Specials',
};

const DRINK_CATEGORIES = new Set([
  'alcoholic-drinks', 'beers', 'wine', 'soft-drinks',
  'drinks', 'beverages', 'cocktails', 'bar',
]);
const SUPERVISOR_SOURCE_TAG = '[source:supervisor-take-order]';

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgoLabel(date: Date | string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function getStaffId(): string | null {
  const direct = localStorage.getItem('staffId');
  if (direct) return direct;
  try {
    const user = JSON.parse(localStorage.getItem('authUser') || '{}');
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export function StaffOrderPage({ restaurantName, restaurantInfo, staffName, sharedTerminalMode = false, onActiveSessionChange, onBack }: StaffOrderPageProps) {
  const { orders, updateOrderStatus } = useOrdersContext();
  const [step, setStep] = useState<'table-select' | 'order-entry'>('table-select');
  // null = Bar / Walk-up (no table number)
  const [selectedTable, setSelectedTable] = useState<number | null | 'bar'>('bar');
  const [tableOccupancy, setTableOccupancy] = useState<Record<number, TableStatus>>({});
  const [tableOrderMeta, setTableOrderMeta] = useState<Record<number, { id: string; createdAt: string }>>({});
  const [occupancyLoading, setOccupancyLoading] = useState(false);

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [pendingPinStaff, setPendingPinStaff] = useState<{ id: string; name: string } | null>(null);
  // Map of staffId → SHA-256 pin hash, fetched from server when in shared terminal mode
  const [pinHashes, setPinHashes] = useState<Record<string, string>>({});

  // Notify the host (e.g. supervisor nav) whenever a waiter checks in/out here.
  useEffect(() => {
    if (sharedTerminalMode) onActiveSessionChange?.(Boolean(selectedStaffId));
  }, [sharedTerminalMode, selectedStaffId, onActiveSessionChange]);

  // Safety net: if this component unmounts while a waiter session was still
  // "active" (e.g. the host navigates away some other way), clear the flag so
  // the host's hidden nav doesn't stay stuck hidden with nothing to unhide it.
  useEffect(() => () => { if (sharedTerminalMode) onActiveSessionChange?.(false); }, [sharedTerminalMode, onActiveSessionChange]);

  // Fetch PIN hashes from server so we know which waiters require a PIN
  useEffect(() => {
    if (!sharedTerminalMode) return;
    fetchPinHashes().then(setPinHashes).catch(() => {});
  }, [sharedTerminalMode]);

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successTable, setSuccessTable] = useState<string | null>(null);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);
  // Mirrors lastPlacedOrder synchronously (state updates from a .then() callback
  // aren't visible to a closure created at an earlier render) — printing awaits
  // orderSyncPromiseRef then reads this, so a receipt printed the instant the
  // success screen appears still reflects the merged/cumulative order, not the
  // locally-synthesized one-round placeholder.
  const lastPlacedOrderRef = useRef<Order | null>(null);
  const orderSyncPromiseRef = useRef<Promise<void> | null>(null);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [showReceiptNoteModal, setShowReceiptNoteModal] = useState(false);
  const [receiptNote, setReceiptNote] = useState('');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [orderSyncError, setOrderSyncError] = useState<string | null>(null);
  // Occupied-table dialog — carries the existing order so it can be previewed
  // (items + total) and, if requested, cancelled — mirrors WaiterDashboard's flow.
  const [confirmOccupied, setConfirmOccupied] = useState<{ tableNumber: number; activeOrder: Order } | null>(null);
  const [mergeCandidate, setMergeCandidate] = useState<Order | null>(null);
  const mergeResolveRef = useRef<((result: boolean) => void) | null>(null);
  const isSubmittingRef = useRef(false);
  const submitKeyRef = useRef(crypto.randomUUID());
  // Context passed into the cart step when adding on top of an already-placed order
  const [existingOrderForEntry, setExistingOrderForEntry] = useState<{ id: string; items: Order['items'] } | null>(null);
  // Pre-made merge decision from the occupied-table dialog — null means "ask via OpenTabModal at submit time"
  const autoMergeRef = useRef<boolean | null>(null);
  // Cancellation-request UI state for the occupied-table dialog — item-level:
  // the waiter checks off specific items (with a per-round "select all" shortcut)
  // rather than being forced to cancel an entire round or the whole order.
  const [cancelRoundMode, setCancelRoundMode] = useState(false);
  const [selectedCancelItemIds, setSelectedCancelItemIds] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [cancelRequestedOrderIds, setCancelRequestedOrderIds] = useState<Set<string>>(new Set());
  const [showRecentOrders, setShowRecentOrders] = useState(false);
  const [printingRecentOrderId, setPrintingRecentOrderId] = useState<string | null>(null);
  const [markingServedId, setMarkingServedId] = useState<string | null>(null);

  const { tables, isLoading: tablesLoading } = useTables();
  const { menuItems, isLoading: menuLoading } = useMenu();
  const { staff, isLoading: staffLoading } = useStaff();
  const staffOptions = useMemo<StaffOption[]>(() => {
    const options = (staff || [])
      .map((member) => {
        if (member?.role !== 'waiter') return null;
        const name = typeof member?.name === 'string' ? member.name.trim() : '';
        if (!member?.id || !name) return null;
        return { id: member.id, name, role: member.role };
      })
      .filter((option): option is StaffOption => Boolean(option));

    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }, [staff]);

  const selectedStaffName = useMemo(() => {
    return staffOptions.find((option) => option.id === selectedStaffId)?.name ?? '';
  }, [staffOptions, selectedStaffId]);

  useEffect(() => {
    if (sharedTerminalMode) return;
    if (selectedStaffId) return;
    const initialByName = (staffName || '').trim();
    if (initialByName) {
      const matched = staffOptions.find((option) => option.name === initialByName);
      if (matched) {
        setSelectedStaffId(matched.id);
        return;
      }
    }
    const currentStaffId = getStaffId();
    if (currentStaffId && staffOptions.some((option) => option.id === currentStaffId)) {
      setSelectedStaffId(currentStaffId);
    }
  }, [selectedStaffId, staffName, staffOptions]);

  // ── Occupancy ────────────────────────────────────────────────────────────────
  const loadOccupancy = useCallback(async () => {
    setOccupancyLoading(true);
    try {
      const active = await fetchKitchenOrders();
      const now = Date.now();
      const staleThreshold = now - 5 * 60 * 60 * 1000;
      const map: Record<number, TableStatus> = {};
      const metaMap: Record<number, { id: string; createdAt: string }> = {};
      (active as any[]).forEach((order) => {
        const tNum: number | undefined = order.tableNumber ?? order.table_number;
        if (tNum == null || tNum === 999) return;
        // Skip orders already confirmed/completed — table is free
        const ps = order.paymentStatus ?? order.payment_status;
        const st = order.status;
        if (ps === 'confirmed' || st === 'completed' || st === 'cancelled') return;
        const createdAt = order.createdAt ?? order.created_at;
        const created = createdAt ? new Date(createdAt).getTime() : 0;
        if (created < staleThreshold) return;
        const age = created ? (now - created) / 60000 : 0;
        const billOut = isBillPresented(order.id);
        const next: TableStatus = (age > 15 && !billOut) ? 'urgent' : 'occupied';
        const current = map[tNum];
        if (!current || (current === 'occupied' && next === 'urgent')) {
          map[tNum] = next;
          metaMap[tNum] = { id: order.id, createdAt: createdAt ?? '' };
        }
      });
      setTableOccupancy(map);
      setTableOrderMeta(metaMap);
    } catch {
      /* non-critical */
    } finally {
      setOccupancyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOccupancy();

    // Skip the poll if Realtime fired recently — it already triggered a reload.
    let lastRealtimeEvent = 0;
    const poll = setInterval(() => {
      if (Date.now() - lastRealtimeEvent < 10_000) return;
      loadOccupancy();
    }, 30_000);

    const restaurantId = localStorage.getItem('restaurantId');
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (restaurantId) {
      channel = supabase
        .channel(`stafforder-occupancy-${restaurantId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
          lastRealtimeEvent = Date.now();
          loadOccupancy();
        })
        .subscribe();
    }

    return () => {
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadOccupancy]);

  // ── Table selection ───────────────────────────────────────────────────────────
  // Same eligibility predicate as WaiterDashboard's findActiveOrderForTable — lets the
  // occupied-table dialog preview what's already on the table before deciding to merge.
  const findActiveOrderForTable = useCallback((tNum: number): Order | null => {
    return orders.find((o) => {
      const ps = o.paymentStatus ?? (o as any).payment_status;
      const tN = o.tableNumber ?? (o as any).table_number;
      return tN === tNum &&
        ['pending', 'verified', 'preparing', 'ready'].includes(o.status) &&
        ps !== 'confirmed';
    }) ?? null;
  }, [orders]);

  // Recent orders — lets any waiter on this shared terminal reprint a receipt or
  // bar chit, jump back into an order, without needing the supervisor Order History.
  // Scoped to the currently selected waiter and shows all their orders.
  const recentOrders = useMemo(() => {
    if (!selectedStaffId) return [];
    return [...orders]
      .filter((o) => {
        // Skip local-only orders that haven't synced yet — 'order-' IS the real
        // server-generated id prefix (see createOrder in api/orders.ts), so it stays.
        if ((o.id ?? '').startsWith('offline-') || (o.id ?? '').startsWith('temp-')) return false;
        return o.assignedWaiterId === selectedStaffId;
      })
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
  }, [orders, selectedStaffId]);

  const staffNameById = useCallback((id?: string) => {
    if (!id) return null;
    return staffOptions.find((s) => s.id === id)?.name ?? null;
  }, [staffOptions]);

  const printReceiptForOrder = async (order: Order) => {
    setPrintingRecentOrderId(order.id);
    try {
      const data = orderToReceiptData(order, {
        restaurantName: restaurantName || 'Company',
        restaurantAddress: restaurantInfo?.address || '',
        restaurantPhone: restaurantInfo?.phone || '',
        restaurantEmail: restaurantInfo?.email || '',
        restaurantLogo: restaurantInfo?.logo,
        restaurantCity: restaurantInfo?.city,
        restaurantCountry: restaurantInfo?.country,
        restaurantMomoCode: restaurantInfo?.momoCode,
        taxRate: 0,
        serverName: staffNameById(order.assignedWaiterId) || resolveStaffName(),
        orderType: order.tableNumber == null || order.tableNumber === 999 ? 'takeout' : 'dine-in',
        paymentStatus: (order as any).paymentStatus === 'confirmed' || (order as any).payment_status === 'confirmed' ? 'paid' : 'pending',
        payments: [{ method: 'Pending', amount: 0 }],
      });
      printReceipt(buildReceiptHtml(data));
      markBillPresented(order.id);
      if (order.tableNumber != null && order.tableNumber !== 999) {
        void markTableSessionPendingCloseFromReceipt(order.tableNumber);
      }
    } catch (e) {
      console.error(e);
      alert('Could not open print window. Please allow pop-ups in your browser.');
    } finally {
      setPrintingRecentOrderId(null);
    }
  };

  // Orders placed from this shared terminal never move past 'pending' on their
  // own (there's no kitchen/waiter flow here to progress them) — without this,
  // the only way to free the table was via the Payments tab elsewhere. Marking
  // served here clears the table immediately (see loadOccupancy above).
  const markOrderServed = async (order: Order) => {
    setMarkingServedId(order.id);
    try {
      await updateOrderStatus(order.id, 'served');
      void loadOccupancy();
    } catch (e) {
      console.error(e);
      alert('Failed to mark order as served. Please try again.');
    } finally {
      setMarkingServedId(null);
    }
  };

  const confirmAndSelectTable = async (tableNum: number) => {
    const status = tableOccupancy[tableNum];
    if (status === 'occupied' || status === 'urgent') {
      // The in-memory orders context can lag behind the DB (missed realtime event,
      // stale poll) — fall back to a live lookup before concluding there's nothing
      // to merge into. This is the same query createOrder itself uses server-side.
      let activeOrder = findActiveOrderForTable(tableNum);
      if (!activeOrder) {
        try {
          // findMergeableOpenOrder returns a raw DB row (snake_case columns) —
          // normalize it so item names/prices render correctly in the dialog below.
          const raw = await findMergeableOpenOrder(tableNum);
          activeOrder = raw ? (normalizeOrderPayload(raw) ?? null) : null;
        } catch {
          activeOrder = null;
        }
      }
      if (activeOrder) {
        setConfirmOccupied({ tableNumber: tableNum, activeOrder });
        return;
      }
    }
    autoMergeRef.current = null;
    openOrderEntry(tableNum);
  };

  const openOrderEntry = (tableNum: number | null, existingOrder: { id: string; items: Order['items'] } | null = null) => {
    setSelectedTable(tableNum === null ? 'bar' : tableNum);
    setCart([]);
    setOrderNotes('');
    setActiveCategory('all');
    setSearchQuery('');
    setConfirmOccupied(null);
    setExistingOrderForEntry(existingOrder);
    setCancelRoundMode(false);
    setSelectedCancelItemIds(new Set());
    setCancelReason('');
    // Rotate the key on every new table selection so a stale key from a
    // previously failed-but-actually-created order can never be reused
    // against a different table, which would return the wrong order.
    submitKeyRef.current = crypto.randomUUID();
    setStep('order-entry');
  };

  // ── Menu ─────────────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((item) => item.category));
    return ['all', ...Array.from(cats)];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    let items = [...menuItems];
    if (activeCategory !== 'all') items = items.filter((i) => i.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => (a.isAvailable === b.isAvailable ? 0 : a.isAvailable ? -1 : 1));
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  // ── Cart ─────────────────────────────────────────────────────────────────────
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          menuItemName: item.name,
          menuItem: item,
          quantity: 1,
          unitPrice: item.price,
          notes: '',
        },
      ];
    });
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const cartTotal = useMemo(
    () => cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.quantity, 0), [cart]);

  const getCartQty = (menuItemId: string) =>
    cart.find((c) => c.menuItemId === menuItemId)?.quantity ?? 0;

  const cartItemNeedsKitchen = (entry: CartEntry): boolean => {
    if (entry.menuItem.requiresKitchen === false) return false;
    if (entry.menuItem.requiresKitchen === true) return true;
    const cat = String(entry.menuItem.category || '').trim().toLowerCase();
    if (!cat || cat === 'unknown') return true;
    return !DRINK_CATEGORIES.has(cat);
  };

  const resolveStaffName = () => {
    if (staffName && staffName.trim()) return staffName.trim();
    try {
      const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
      if (typeof authUser?.name === 'string' && authUser.name.trim()) {
        return authUser.name.trim();
      }
    } catch {
      // Ignore invalid local storage payload.
    }
    return 'Supervisor';
  };

  const printChitForOrder = (order: Order) => {
    const label = order.tableNumber != null ? `Table ${order.tableNumber}` : 'Bar / Walk-up';
    try {
      printReceipt(buildChitHtml({
        restaurantName: restaurantName,
        restaurantLogo: restaurantInfo?.logo,
        restaurantAddress: restaurantInfo?.address,
        restaurantPhone: restaurantInfo?.phone,
        restaurantEmail: restaurantInfo?.email,
        restaurantCity: restaurantInfo?.city,
        restaurantCountry: restaurantInfo?.country,
        restaurantMomoCode: restaurantInfo?.momoCode,
        orderNumber: order.orderNumber ?? order.id,
        tableLabel: label,
        waiterName: staffNameById(order.assignedWaiterId) || resolveStaffName() || undefined,
        items: order.items.map((item: any) => ({
          quantity: item.quantity,
          name: item.menuItemName ?? item.menu_item_name ?? item.menuItem?.name ?? 'Item',
          notes: item.specialInstructions || item.special_instructions || undefined,
          totalPrice: item.totalPrice ?? item.total_price,
        })),
        total: order.total,
        notes: (order as any).notes?.trim() || undefined,
      }));
    } catch {
      alert('Could not open print window. Please allow pop-ups in your browser.');
    }
  };

  const handlePrintLastReceipt = () => {
    if (!lastPlacedOrder || isPrintingReceipt) return;
    void handlePrintSmart();
  };

  const buildReceiptDataFor = (order: Order, notesOverride?: string): ReceiptData => orderToReceiptData(order, {
    restaurantName: restaurantName || 'Company',
    restaurantAddress: restaurantInfo?.address || '',
    restaurantPhone: restaurantInfo?.phone || '',
    restaurantEmail: restaurantInfo?.email || '',
    restaurantLogo: restaurantInfo?.logo,
    restaurantCity: restaurantInfo?.city,
    restaurantCountry: restaurantInfo?.country,
    restaurantMomoCode: restaurantInfo?.momoCode,
    taxRate: 0,
    serverName: selectedStaffName || resolveStaffName(),
    orderType: order.tableNumber == null ? 'takeout' : 'dine-in',
    paymentStatus: 'pending',
    payments: [{ method: 'Pending', amount: 0 }],
    notes: notesOverride,
  });

  const handlePrintSmart = async () => {
    setIsPrintingReceipt(true);
    try {
      // If the order was just placed (possibly merged into an existing tab),
      // wait for that background sync so the receipt reflects the full,
      // cumulative table bill instead of only this round's items.
      if (orderSyncPromiseRef.current) await orderSyncPromiseRef.current;
      const order = lastPlacedOrderRef.current;
      if (!order) return;
      printReceipt(buildReceiptHtml(buildReceiptDataFor(order)));
      markBillPresented(order.id);
      if (order.tableNumber != null) void markTableSessionPendingCloseFromReceipt(order.tableNumber);
    } catch {
      alert('Could not open print window. Please allow pop-ups in your browser.');
    } finally {
      setIsPrintingReceipt(false);
    }
  };

  const confirmPrintLastReceipt = async () => {
    if (isPrintingReceipt) return;
    setIsPrintingReceipt(true);
    try {
      if (orderSyncPromiseRef.current) await orderSyncPromiseRef.current;
      const order = lastPlacedOrderRef.current;
      if (!order) return;
      const combinedNotes = [order.notes?.trim() || '', receiptNote.trim()].filter(Boolean).join('\n');
      const html = buildReceiptHtml(buildReceiptDataFor(order, combinedNotes || undefined));
      printReceipt(html);
      markBillPresented(order.id);
      if (order.tableNumber != null) void markTableSessionPendingCloseFromReceipt(order.tableNumber);
      setShowReceiptNoteModal(false);
    } catch (e) {
      console.error(e);
      alert('Failed to print receipt. Please try again.');
    } finally {
      setIsPrintingReceipt(false);
    }
  };

  const handleDoneAfterSuccess = () => {
    setSuccessTable(null);
    setLastPlacedOrder(null);
    lastPlacedOrderRef.current = null;
    orderSyncPromiseRef.current = null;
    setExistingOrderForEntry(null);
    setStep('table-select');
    if (sharedTerminalMode) {
      setSelectedStaffId('');
    }
    loadOccupancy();
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (isSubmittingRef.current) return;
    if (sharedTerminalMode && !selectedStaffId) {
      alert('Select the active waiter before placing an order.');
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setOrderSyncError(null);

    try {
      const checkoutCart = [...cart];
      const visibleNotes = [
        selectedStaffName ? `Waiter: ${selectedStaffName}` : '',
        orderNotes.trim(),
      ].filter(Boolean).join('\n');
      const includeSupervisorSource = !selectedStaffId;
      const persistedNotes = [includeSupervisorSource ? SUPERVISOR_SOURCE_TAG : '', visibleNotes].filter(Boolean).join('\n');
      const tableNum = selectedTable === 'bar' ? undefined : (selectedTable as number);
      const needsKitchen = checkoutCart.some(cartItemNeedsKitchen);
      let allowMergeToOpenTab = false;

      if (autoMergeRef.current !== null) {
        // Already decided in the occupied-table dialog ("Add to this order" /
        // "Start a separate order") — honor it without asking again.
        allowMergeToOpenTab = autoMergeRef.current;
        autoMergeRef.current = null;
      } else if (typeof tableNum === 'number' && tableNum > 0 && tableNum !== 999) {
        // No pre-made decision (e.g. table looked free when selected but a tab
        // opened in the meantime) — fall back to the in-memory merge lookup, and
        // if that misses (stale/lagging context), a live DB lookup before the modal.
        let candidate = findMergeableInOrders(orders, tableNum);
        if (!candidate) {
          try {
            const raw = await findMergeableOpenOrder(tableNum);
            candidate = raw ? (normalizeOrderPayload(raw) ?? null) : null;
          } catch {
            candidate = null;
          }
        }
        if (candidate) {
          allowMergeToOpenTab = await new Promise<boolean>((resolve) => {
            setMergeCandidate(candidate);
            mergeResolveRef.current = resolve;
          });
        }
      }

      // Build receipt from cart immediately — no need to wait for the server
      const nowIso = new Date().toISOString();
      const fallbackSubtotal = checkoutCart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
      const localItems = checkoutCart.map((c, index) => ({
        id: `item-${Date.now()}-${index}`,
        menuItem: c.menuItem,
        menuItemId: c.menuItemId,
        menuItemName: c.menuItemName,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        totalPrice: c.unitPrice * c.quantity,
        specialInstructions: c.notes || undefined,
        status: 'pending',
      }));
      const localOrder: Order = {
        id: `order-${Date.now()}`,
        tableNumber: tableNum,
        status: 'pending' as any,
        items: localItems,
        createdAt: nowIso,
        updatedAt: nowIso,
        subtotal: fallbackSubtotal,
        tax: 0,
        total: fallbackSubtotal,
        notes: visibleNotes || undefined,
        requiresKitchen: needsKitchen,
      };

      // Show success immediately — no waiting for the network
      const label = selectedTable === 'bar' ? 'Bar / Walk-up' : `Table ${selectedTable}`;
      setSuccessTable(label);
      setLastPlacedOrder(localOrder);
      lastPlacedOrderRef.current = localOrder;
      setCart([]);
      setOrderNotes('');
      setShowMobileCart(false);
      const idempotencyKey = submitKeyRef.current;
      submitKeyRef.current = crypto.randomUUID();

      // Submit to DB in the background — update the receipt with the confirmed order number.
      // Tracked in orderSyncPromiseRef so a print triggered before this settles can await it
      // first, rather than printing the local one-round placeholder.
      orderSyncPromiseRef.current = createOrder({
        tableNumber: tableNum,
        items: checkoutCart.map((c) => ({
          menuItemId: c.menuItemId,
          menuItemName: c.menuItemName,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          notes: c.notes || undefined,
          category: c.menuItem.category,
          requiresKitchen: cartItemNeedsKitchen(c),
        })),
        notes: persistedNotes || undefined,
        createdBy: selectedStaffId || getStaffId() || undefined,
        assignedWaiterId: selectedStaffId || undefined,
        requiresKitchen: needsKitchen,
        allowMergeToOpenTab,
        idempotencyKey,
      } as any).then((created) => {
        // Normalize the server row back into an Order — when this submission merged
        // into an existing tab, `created.items` is the FULL merged list (all rounds),
        // so this is what makes "Print Receipt" show the cumulative table bill instead
        // of just the items from this one round.
        const normalized = normalizeOrderPayload(created);
        setLastPlacedOrder((prev) => {
          const next: Order | null = !prev
            ? prev
            : normalized
              ? { ...normalized, id: normalized.id || prev.id }
              : {
                  ...prev,
                  id: String((created as any)?.id || prev.id),
                  orderNumber: (created as any)?.orderNumber ?? (created as any)?.order_number ?? prev.orderNumber,
                  status: String((created as any)?.status || prev.status) as any,
                };
          lastPlacedOrderRef.current = next;
          return next;
        });
      }).catch((e) => {
        console.error('Background order sync failed:', e);
        const isTimeout = (e as any)?.code === 'TIMEOUT' || (e instanceof Error && e.message.includes('timed out'));
        setOrderSyncError(isTimeout
          ? 'Order timed out — it may not have saved. Check the orders list.'
          : 'Order failed to save to server. Please check the orders list.'
        );
      });
    } catch (e) {
      console.error(e);
      alert('Failed to place order. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // ── Table status helpers ───────────────────────────────────────────────────
  const tableStatusClasses = (tNum: number) => {
    const s = tableOccupancy[tNum];
    if (s === 'urgent')
      return 'border-red-500 bg-red-500/15 text-red-200 hover:bg-red-500/25';
    if (s === 'occupied')
      return 'border-amber-500 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25';
    return 'border-slate-600 bg-slate-800 text-slate-300 hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-white';
  };

  const tableStatusDot = (tNum: number) => {
    const s = tableOccupancy[tNum];
    if (s === 'urgent') return 'bg-red-400';
    if (s === 'occupied') return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  const tableLabel = selectedTable === 'bar' ? 'Bar / Walk-up' : `Table ${selectedTable}`;
  const tableOccupancyStatus = selectedTable !== 'bar' && selectedTable !== null
    ? tableOccupancy[selectedTable as number]
    : undefined;

  if (sharedTerminalMode && !selectedStaffId) {
    return (
      <>
      <div className="min-h-screen bg-slate-950 p-4 md:p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 md:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                aria-label="Back"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-2xl font-bold text-white">Select Waiter</h1>
          </div>

          {staffLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-8 text-center text-slate-400">Loading waiters...</div>
          ) : staffOptions.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-amber-200">
              No waiter accounts are available. Add waiter staff records before using the shared terminal.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staffOptions.map((option) => {
                const initials = option.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join('') || '?';
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      if (pinHashes[option.id]) {
                        setPendingPinStaff({ id: option.id, name: option.name });
                      } else {
                        setSelectedStaffId(option.id);
                      }
                    }}
                    className="group flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800 px-5 py-6 text-left transition-colors hover:border-amber-500 hover:bg-slate-800/90"
                  >
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xl font-bold text-amber-300 transition-colors group-hover:bg-amber-500/25">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xl font-bold text-white">{option.name}</p>
                      <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-slate-400">{option.role || 'waiter'}</p>
                    </div>
                    {pinHashes[option.id] && (
                      <div className="ml-auto shrink-0 text-slate-500">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {pendingPinStaff && (
        <StaffPinModal
          staffName={pendingPinStaff.name}
          pinHash={pinHashes[pendingPinStaff.id] ?? ''}
          onSuccess={() => {
            setSelectedStaffId(pendingPinStaff.id);
            setPendingPinStaff(null);
          }}
          onCancel={() => setPendingPinStaff(null)}
        />
      )}
      </>
    );
  }

  // ── Render: table picker ──────────────────────────────────────────────────────
  if (step === 'table-select') {
    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-6">
        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Take Order</h1>
              <p className="mt-1 text-sm text-slate-400">
                {sharedTerminalMode
                  ? `Active waiter: ${selectedStaffName}. Select a table or choose Bar / Walk-up.`
                  : 'Select a table or choose Bar / Walk-up'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sharedTerminalMode && (
                <button
                  onClick={() => {
                    setSelectedStaffId('');
                    setCart([]);
                    setOrderNotes('');
                    setLastPlacedOrder(null);
                    setSuccessTable(null);
                    setStep('table-select');
                  }}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  Switch Waiter
                </button>
              )}
              <button
                onClick={() => setShowRecentOrders(true)}
                className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <ReceiptTextIcon className="w-4 h-4" />
                Recent Orders
              </button>
              <button
                onClick={loadOccupancy}
                disabled={occupancyLoading}
                className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <RefreshCwIcon className={`w-4 h-4 ${occupancyLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="mb-4 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Free</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Occupied</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Urgent (&gt;15 min)</span>
          </div>

          {/* Bar / Walk-up */}
          <button
            onClick={() => { autoMergeRef.current = null; openOrderEntry(null); }}
            className="mb-6 w-full rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/10 py-4 text-amber-300 font-semibold text-base hover:bg-amber-500/20 hover:border-amber-400 transition-colors"
          >
            Bar / Walk-up (no table)
          </button>

          {/* Table grid */}
          {tablesLoading ? (
            <div className="text-center text-slate-500 py-12">Loading tables...</div>
          ) : tables.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              No tables configured. Add tables in QR Codes settings.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[...tables].sort((a, b) => a - b).map((tNum) => {
                const status = tableOccupancy[tNum];
                const meta = tableOrderMeta[tNum];
                const billOut = meta ? isBillPresented(meta.id) : false;
                const createdMs = meta?.createdAt ? new Date(meta.createdAt).getTime() : 0;
                const elapsedMin = createdMs ? Math.floor((Date.now() - createdMs) / 60000) : 0;
                const elapsedStr = elapsedMin >= 60
                  ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`
                  : `${elapsedMin}m`;
                const timeColor = status === 'urgent' ? 'text-red-300' : 'text-amber-300';
                return (
                  <button
                    key={tNum}
                    onClick={() => confirmAndSelectTable(tNum)}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 min-h-[6.5rem] transition-all ${tableStatusClasses(tNum)}`}
                  >
                    <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${tableStatusDot(tNum)}`} />
                    {billOut && (
                      <span className="absolute top-2 left-2">
                        <ReceiptTextIcon className="w-3.5 h-3.5 text-blue-400" />
                      </span>
                    )}
                    <span className="font-bold text-xl">{tNum}</span>
                    {status && createdMs ? (
                      <span className={`text-sm font-bold mt-0.5 flex items-center gap-0.5 ${timeColor} ${status === 'urgent' ? 'animate-pulse' : ''}`}>
                        <ClockIcon className="w-3 h-3" />{elapsedStr}
                      </span>
                    ) : null}
                    <span className="text-xs font-normal opacity-70 mt-0.5">
                      {status === 'urgent' ? 'urgent' : status === 'occupied' ? 'busy' : 'free'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Occupied-table dialog — previews the existing order and lets the waiter
            add to it, start a separate order, or request its cancellation */}
        {confirmOccupied !== null && (() => {
          const { tableNumber, activeOrder } = confirmOccupied;
          const rounds = [...new Set((activeOrder.items || []).map((i: any) => i.round ?? 1))].sort((a, b) => a - b) as number[];
          const alreadyRequested = cancelRequestedOrderIds.has(activeOrder.id);

          const submitCancelRequest = async () => {
            if (selectedCancelItemIds.size === 0 || !cancelReason.trim()) return;
            setSubmittingCancel(true);
            try {
              await requestOrderCancellation(activeOrder.id, {
                reason: cancelReason.trim(),
                itemIds: Array.from(selectedCancelItemIds),
                requestedBy: selectedStaffId || getStaffId() || undefined,
                requestedByName: selectedStaffName || resolveStaffName(),
              });
              setCancelRequestedOrderIds((prev) => new Set(prev).add(activeOrder.id));
              setCancelRoundMode(false);
              setCancelReason('');
              setSelectedCancelItemIds(new Set());
            } catch (e) {
              console.error(e);
              alert('Failed to submit cancellation request. Please try again.');
            } finally {
              setSubmittingCancel(false);
            }
          };

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-slate-700">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Active Order</p>
                  </div>
                  <h3 className="text-lg font-bold text-white">Table {tableNumber}</h3>
                </div>

                {!cancelRoundMode ? (
                  <>
                    {/* Existing items */}
                    <div className="max-h-52 overflow-y-auto px-5 py-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">Items currently on this table:</p>
                      <div className="space-y-1.5">
                        {activeOrder.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex-1 truncate text-slate-200">{item.menuItemName || 'Item'}</span>
                            <span className="shrink-0 text-slate-500">×{item.quantity}</span>
                            <span className="shrink-0 font-medium text-slate-400">{formatPrice((item.unitPrice || 0) * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-between border-t border-slate-700/60 pt-2 text-sm font-semibold">
                        <span className="text-slate-400">Order total</span>
                        <span className="text-white">{formatPrice(activeOrder.total)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 px-5 pb-5 pt-3">
                      <button
                        onClick={() => {
                          autoMergeRef.current = true;
                          openOrderEntry(tableNumber, { id: activeOrder.id, items: activeOrder.items });
                        }}
                        className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400"
                      >
                        Add to this order
                      </button>
                      <button
                        onClick={() => {
                          autoMergeRef.current = false;
                          openOrderEntry(tableNumber);
                        }}
                        className="w-full rounded-xl bg-slate-700 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
                      >
                        Start a separate order
                      </button>
                      {activeOrder.status !== 'served' && (
                        <button
                          onClick={() => void markOrderServed(activeOrder).then(() => setConfirmOccupied(null))}
                          disabled={markingServedId === activeOrder.id}
                          className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {markingServedId === activeOrder.id ? 'Marking served…' : 'Mark Served (clears table)'}
                        </button>
                      )}
                      {alreadyRequested ? (
                        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-300">
                          <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                          Cancellation requested — awaiting manager approval
                        </div>
                      ) : (
                        <button
                          onClick={() => setCancelRoundMode(true)}
                          className="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
                        >
                          Request Cancellation
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmOccupied(null)}
                        className="w-full py-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  /* Cancellation request form — pick specific items, with a per-round
                     "select all" shortcut so cancelling a whole batch is still one tap */
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto px-5 pb-5 pt-4">
                    <p className="text-sm font-semibold text-red-300">Select items to cancel</p>

                    {rounds.map((r) => {
                      const roundItems = (activeOrder.items || []).filter((i: any) => (i.round ?? 1) === r);
                      if (roundItems.length === 0) return null;
                      const roundItemIds = roundItems.map((i: any) => i.id).filter(Boolean);
                      const allSelected = roundItemIds.length > 0 && roundItemIds.every((id: string) => selectedCancelItemIds.has(id));
                      return (
                        <div key={r} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60">
                          {rounds.length > 1 && (
                            <button
                              onClick={() => setSelectedCancelItemIds((prev) => {
                                const next = new Set(prev);
                                roundItemIds.forEach((id: string) => allSelected ? next.delete(id) : next.add(id));
                                return next;
                              })}
                              className="flex w-full items-center justify-between border-b border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-left transition-colors hover:bg-slate-800"
                            >
                              <span className="text-xs font-semibold text-slate-300">Round {r}</span>
                              <span className="text-[11px] font-medium text-amber-300">{allSelected ? 'Deselect all' : 'Select all'}</span>
                            </button>
                          )}
                          <div className="divide-y divide-slate-800">
                            {roundItems.map((item: any) => {
                              const checked = item.id ? selectedCancelItemIds.has(item.id) : false;
                              return (
                                <label key={item.id ?? item.menuItemName} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-slate-800/40">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!item.id}
                                    onChange={() => {
                                      if (!item.id) return;
                                      setSelectedCancelItemIds((prev) => {
                                        const next = new Set(prev);
                                        if (checked) next.delete(item.id); else next.add(item.id);
                                        return next;
                                      });
                                    }}
                                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500/40"
                                  />
                                  <span className="flex-1 truncate text-sm text-slate-200">{item.quantity}× {item.menuItemName || 'Item'}</span>
                                  <span className="shrink-0 text-xs font-medium text-slate-400">{formatPrice((item.unitPrice || 0) * item.quantity)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Reason for cancelling these items…"
                      rows={2}
                      className="w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500/60"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCancelRoundMode(false); setCancelReason(''); setSelectedCancelItemIds(new Set()); }}
                        className="flex-1 rounded-lg bg-slate-700 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-600"
                      >
                        Back
                      </button>
                      <button
                        disabled={selectedCancelItemIds.size === 0 || !cancelReason.trim() || submittingCancel}
                        onClick={submitCancelRequest}
                        className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submittingCancel
                          ? 'Sending…'
                          : selectedCancelItemIds.size === 0
                            ? 'Select items to cancel'
                            : `Cancel ${selectedCancelItemIds.size} item${selectedCancelItemIds.size === 1 ? '' : 's'}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Recent Orders — reprint a receipt, or jump into an existing order to
            add more / request cancellation (reuses the occupied-table dialog) */}
        {showRecentOrders && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Recent Orders</h3>
                  <p className="text-xs text-slate-400">
                    {selectedStaffName ? `All orders by ${selectedStaffName}` : 'Select a waiter first'}
                  </p>
                </div>
                <button onClick={() => setShowRecentOrders(false)} className="text-slate-400 hover:text-slate-200">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3">
                {recentOrders.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">No recent orders for this waiter</p>
                ) : (
                  <div className="space-y-2">
                    {recentOrders.map((order) => {
                      const label = order.tableNumber == null || order.tableNumber === 999
                        ? 'Bar / Walk-up'
                        : `Table ${order.tableNumber}`;
                      const isCancelled = order.status === 'cancelled';
                      const canOpen = !isCancelled && order.tableNumber != null && order.tableNumber !== 999;
                      return (
                        <div key={order.id} className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="font-semibold text-white">{label}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  isCancelled
                                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                    : 'border-slate-600 bg-slate-900 text-slate-300'
                                }`}>
                                  {order.status}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {timeAgoLabel(order.createdAt)} · {order.items.length} item{order.items.length === 1 ? '' : 's'}
                              </p>
                            </div>
                            <p className="shrink-0 font-bold text-amber-300">{formatPrice(order.total)}</p>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <button
                              onClick={() => void printReceiptForOrder(order)}
                              disabled={printingRecentOrderId === order.id}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                            >
                              <PrinterIcon className="h-3.5 w-3.5" />
                              {printingRecentOrderId === order.id ? 'Printing…' : 'Receipt'}
                            </button>
                            {restaurantInfo?.barChitEnabled !== false && (
                              <button
                                onClick={() => printChitForOrder(order)}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700"
                              >
                                <PrinterIcon className="h-3.5 w-3.5" />
                                Bar Chit
                              </button>
                            )}
                            {canOpen && (
                              <button
                                onClick={() => {
                                  setConfirmOccupied({ tableNumber: order.tableNumber as number, activeOrder: order });
                                  setShowRecentOrders(false);
                                }}
                                className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
                              >
                                View / Add / Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: order entry ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 pb-24 md:pb-0">

      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900/95 backdrop-blur-sm px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { autoMergeRef.current = null; setExistingOrderForEntry(null); setStep('table-select'); setCart([]); }}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Tables
            </button>
            <div>
              <p className="font-semibold text-white">{tableLabel}</p>
              {sharedTerminalMode && selectedStaffName && (
                <p className="text-xs text-amber-300">Taking order as {selectedStaffName}</p>
              )}
              {tableOccupancyStatus && (
                <p className={`text-xs ${tableOccupancyStatus === 'urgent' ? 'text-red-400' : 'text-amber-400'}`}>
                  {tableOccupancyStatus === 'urgent'
                    ? 'Urgent — orders waiting >15 min'
                    : existingOrderForEntry
                      ? 'Adding to the existing order'
                      : 'Table occupied — starting a separate order'}
                </p>
              )}
            </div>
          </div>

          {/* Mobile cart toggle */}
          <button
            onClick={() => setShowMobileCart(true)}
            className="relative flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 md:hidden"
          >
            <ShoppingCartIcon className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                {cartCount}
              </span>
            )}
            {formatPrice(cartTotal)}
          </button>
        </div>

        {/* Search + category tabs — part of the sticky header so filtering stays
            reachable without scrolling back up through the menu grid */}
        <div className="max-w-6xl mx-auto px-4 pb-3 md:px-4">
          <div className="relative mb-3">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search menu..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-9 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label="Clear search"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex gap-0 md:gap-6 p-0 md:p-4">

        {/* ── Menu panel ── */}
        <div className="flex-1 min-w-0 p-4 md:p-0">

          {/* Menu items */}
          {menuLoading ? (
            <div className="flex flex-col items-center gap-2 py-20 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-amber-400" />
              <p className="text-sm">Loading menu...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center text-slate-500">
              <SearchIcon className="h-8 w-8 text-slate-700" />
              <p className="text-sm">No items found</p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs font-semibold text-amber-400 hover:text-amber-300">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => {
                const qty = getCartQty(item.id);
                const outOfStock = !item.isAvailable;
                return (
                  <div
                    key={item.id}
                    role={outOfStock ? undefined : 'button'}
                    tabIndex={outOfStock ? undefined : 0}
                    onClick={() => !outOfStock && addToCart(item)}
                    onKeyDown={(e) => { if (!outOfStock && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); addToCart(item); } }}
                    className={`relative flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-2xl border-2 p-4 transition-all ${
                      outOfStock
                        ? 'cursor-not-allowed border-slate-800 bg-slate-800/50 opacity-60'
                        : qty > 0
                          ? 'cursor-pointer border-amber-500/70 bg-slate-800'
                          : 'cursor-pointer border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {qty > 0 && (
                      <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-slate-900 shadow-lg">
                        {qty}
                      </span>
                    )}

                    <div>
                      <p className={`text-lg font-bold leading-snug ${outOfStock ? 'text-slate-500' : 'text-white'}`}>{item.name}</p>
                      {outOfStock && (
                        <span className="mt-1 inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                          Out of Stock
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className={`text-base font-bold ${outOfStock ? 'text-slate-500' : 'text-amber-400'}`}>{formatPrice(item.price)}</p>
                      {!outOfStock && qty > 0 && (
                        <div
                          className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 p-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-white transition-colors hover:bg-slate-600"
                          >
                            <MinusIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => addToCart(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-slate-900 transition-colors hover:bg-amber-400"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Desktop cart ── */}
        <div className="hidden md:flex w-80 flex-shrink-0 flex-col">
          <CartPanel
            cart={cart}
            cartTotal={cartTotal}
            cartCount={cartCount}
            orderNotes={orderNotes}
            selectedStaffId={selectedStaffId}
            selectedStaffName={selectedStaffName}
            staffOptions={staffOptions}
            staffLoading={staffLoading}
            isSubmitting={isSubmitting}
            successTable={successTable}
            orderSyncError={orderSyncError}
            tableLabel={tableLabel}
            sharedTerminalMode={sharedTerminalMode}
            canPrintReceipt={Boolean(lastPlacedOrder)}
            isPrintingReceipt={isPrintingReceipt}
            existingOrder={existingOrderForEntry}
            onUpdateQty={updateQty}
            onNotesChange={setOrderNotes}
            onSelectedStaffIdChange={setSelectedStaffId}
            onSubmit={handleSubmit}
            onPrintReceipt={handlePrintLastReceipt}
            onDone={handleDoneAfterSuccess}
          />
        </div>
      </div>

      {/* Mobile cart sheet */}
      {showMobileCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobileCart(false)} />
          <div className="relative rounded-t-2xl border-t border-slate-700 bg-slate-900 p-4 max-h-[80vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-white">Cart — {tableLabel}</h3>
              <button onClick={() => setShowMobileCart(false)}>
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <CartPanel
              cart={cart}
              cartTotal={cartTotal}
              cartCount={cartCount}
              orderNotes={orderNotes}
              selectedStaffId={selectedStaffId}
              selectedStaffName={selectedStaffName}
              staffOptions={staffOptions}
              staffLoading={staffLoading}
              isSubmitting={isSubmitting}
              successTable={successTable}
              orderSyncError={orderSyncError}
              tableLabel={tableLabel}
              sharedTerminalMode={sharedTerminalMode}
              canPrintReceipt={Boolean(lastPlacedOrder)}
              isPrintingReceipt={isPrintingReceipt}
              existingOrder={existingOrderForEntry}
              onUpdateQty={updateQty}
              onNotesChange={setOrderNotes}
              onSelectedStaffIdChange={setSelectedStaffId}
              onSubmit={() => { handleSubmit(); setShowMobileCart(false); }}
              onPrintReceipt={handlePrintLastReceipt}
              onDone={handleDoneAfterSuccess}
            />
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

      <Modal isOpen={showReceiptNoteModal} onClose={() => setShowReceiptNoteModal(false)} title="Add Receipt Note">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Add an optional note that will appear on the printed receipt.
          </p>
          <textarea
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
            rows={4}
            placeholder="Enter note for this receipt"
            className="w-full resize-none rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setShowReceiptNoteModal(false)}
              className="flex-1 rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={confirmPrintLastReceipt}
              disabled={isPrintingReceipt}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPrintingReceipt ? 'Printing...' : 'Print Receipt'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Cart panel (shared between desktop sidebar and mobile sheet) ──────────────
function CartPanel({
  cart,
  cartTotal,
  cartCount,
  orderNotes,
  selectedStaffId,
  selectedStaffName,
  staffOptions,
  staffLoading,
  isSubmitting,
  successTable,
  orderSyncError,
  tableLabel,
  sharedTerminalMode,
  canPrintReceipt,
  isPrintingReceipt,
  existingOrder,
  onUpdateQty,
  onNotesChange,
  onSelectedStaffIdChange,
  onSubmit,
  onPrintReceipt,
  onDone,
}: {
  cart: CartEntry[];
  cartTotal: number;
  cartCount: number;
  orderNotes: string;
  selectedStaffId: string;
  selectedStaffName: string;
  staffOptions: StaffOption[];
  staffLoading: boolean;
  isSubmitting: boolean;
  successTable: string | null;
  orderSyncError: string | null;
  tableLabel: string;
  sharedTerminalMode: boolean;
  canPrintReceipt: boolean;
  isPrintingReceipt: boolean;
  existingOrder: { id: string; items: Order['items'] } | null;
  onUpdateQty: (id: string, delta: number) => void;
  onNotesChange: (v: string) => void;
  onSelectedStaffIdChange: (v: string) => void;
  onSubmit: () => void;
  onPrintReceipt: () => void;
  onDone: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);

  if (successTable) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <CheckCircleIcon className="w-14 h-14 text-emerald-400" />
        <p className="font-bold text-lg text-white">Order placed!</p>
        <p className="text-sm text-slate-400">{successTable}</p>
        {orderSyncError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 max-w-xs">
            ⚠️ {orderSyncError}
          </p>
        )}
        <div className="mt-2 w-full max-w-xs space-y-2">
          {canPrintReceipt && (
            <button
              onClick={onPrintReceipt}
              disabled={isPrintingReceipt}
              className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <PrinterIcon className="inline w-4 h-4 mr-1.5" />
              {isPrintingReceipt ? 'Printing...' : 'Print Receipt'}
            </button>
          )}
          <button
            onClick={onDone}
            className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400"
          >
            New Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sticky top-20">
      {existingOrder && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">Already on table</p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {existingOrder.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex-1 truncate text-slate-300">{item.menuItemName || 'Item'}</span>
                <span className="shrink-0 text-slate-500">×{item.quantity}</span>
                <span className="shrink-0 font-medium text-slate-400">{formatPrice((item.unitPrice || 0) * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-amber-500/20 pt-2 text-xs font-semibold">
            <span className="text-slate-400">Subtotal so far</span>
            <span className="text-amber-300">
              {formatPrice(existingOrder.items.reduce((s, i) => s + (i.unitPrice || 0) * i.quantity, 0))}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">
            <ShoppingCartIcon className="inline w-4 h-4 mr-1.5 text-amber-400" />
            {existingOrder ? 'New Items' : 'Cart'}
          </h3>
          {cartCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
              {cartCount} item{cartCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {cart.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No items added yet</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {cart.map((entry) => (
              <div key={entry.menuItemId} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-white">{entry.menuItemName}</p>
                  <p className="text-xs text-slate-400">{formatPrice(entry.unitPrice)} each</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onUpdateQty(entry.menuItemId, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                  >
                    <MinusIcon className="w-3 h-3" />
                  </button>
                  <span className="w-5 text-center text-sm font-bold text-white">{entry.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(entry.menuItemId, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                  >
                    <PlusIcon className="w-3 h-3" />
                  </button>
                </div>
                <p className="w-16 text-right text-sm font-semibold text-white flex-shrink-0">
                  {formatPrice(entry.unitPrice * entry.quantity)}
                </p>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <div className="my-3 border-t border-slate-700" />
            <div className="flex justify-between text-sm font-bold">
              <span className="text-slate-400">Total</span>
              <span className="text-amber-400 text-base">{formatPrice(cartTotal)}</span>
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        {sharedTerminalMode ? (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Active Waiter</p>
                <p className="mt-1 text-sm font-semibold text-white">{selectedStaffName || 'Not selected'}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelectedStaffIdChange('')}
                className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25"
              >
                Switch
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Assign Waiter
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => onSelectedStaffIdChange(e.target.value)}
              disabled={staffLoading || staffOptions.length === 0}
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            >
              <option value="">{staffLoading ? 'Loading waiters...' : 'Select waiter'}</option>
              {staffOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}{option.role ? ` (${option.role})` : ''}
                </option>
              ))}
            </select>
          </>
        )}

        {showNotes || orderNotes ? (
          <>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Order Notes
            </label>
            <textarea
              value={orderNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Allergies, special requests..."
              rows={3}
              autoFocus={showNotes}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none resize-none"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-xs font-medium text-slate-500 hover:text-amber-400 transition-colors"
          >
            + Add a note (allergies, special requests)
          </button>
        )}
      </div>

      <button
        onClick={onSubmit}
        disabled={cart.length === 0 || isSubmitting}
        className="w-full rounded-xl bg-amber-500 py-3.5 font-bold text-slate-900 hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? (existingOrder ? 'Adding items...' : 'Placing order...')
          : cart.length === 0
            ? 'Add items to order'
            : existingOrder
              ? `Add Items to Order — ${formatPrice(cartTotal)}`
              : `Place Order — ${formatPrice(cartTotal)}`}
      </button>
      <p className="text-center text-xs text-slate-500">{tableLabel}</p>
    </div>
  );
}
