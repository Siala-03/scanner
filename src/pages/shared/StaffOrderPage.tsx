import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ChevronLeftIcon,
  PlusIcon,
  MinusIcon,
  ShoppingCartIcon,
  SearchIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  XIcon,
  UtensilsIcon,
  PrinterIcon,
} from 'lucide-react';
import { useMenu } from '../../hooks/useMenu';
import { useTables } from '../../hooks/useTables';
import { useStaff } from '../../hooks/useStaff';
import { createOrder } from '../../api/orders';
import { fetchKitchenOrders } from '../../api/orders';
import { formatPrice } from '../../utils/currency';
import { buildReceiptHtml, orderToReceiptData, printReceipt } from '../../utils/receipt';
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
  };
  staffName?: string;
  sharedTerminalMode?: boolean;
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

export function StaffOrderPage({ restaurantName, restaurantInfo, staffName, sharedTerminalMode = false }: StaffOrderPageProps) {
  const [step, setStep] = useState<'table-select' | 'order-entry'>('table-select');
  // null = Bar / Walk-up (no table number)
  const [selectedTable, setSelectedTable] = useState<number | null | 'bar'>('bar');
  const [tableOccupancy, setTableOccupancy] = useState<Record<number, TableStatus>>({});
  const [occupancyLoading, setOccupancyLoading] = useState(false);

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successTable, setSuccessTable] = useState<string | null>(null);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [showReceiptNoteModal, setShowReceiptNoteModal] = useState(false);
  const [receiptNote, setReceiptNote] = useState('');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [confirmOccupied, setConfirmOccupied] = useState<number | null>(null);

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
      const map: Record<number, TableStatus> = {};
      (active as any[]).forEach((order) => {
        const tNum: number | undefined = order.tableNumber ?? order.table_number;
        if (tNum == null || tNum === 999) return;
        const createdAt = order.createdAt ?? order.created_at;
        const age = createdAt ? (now - new Date(createdAt).getTime()) / 60000 : 0;
        const next: TableStatus = age > 15 ? 'urgent' : 'occupied';
        const current = map[tNum];
        if (!current || (current === 'occupied' && next === 'urgent')) {
          map[tNum] = next;
        }
      });
      setTableOccupancy(map);
    } catch {
      /* non-critical */
    } finally {
      setOccupancyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOccupancy();
    const id = setInterval(loadOccupancy, 15000);
    return () => clearInterval(id);
  }, [loadOccupancy]);

  // ── Table selection ───────────────────────────────────────────────────────────
  const confirmAndSelectTable = (tableNum: number) => {
    const status = tableOccupancy[tableNum];
    if (status === 'occupied' || status === 'urgent') {
      setConfirmOccupied(tableNum);
    } else {
      openOrderEntry(tableNum);
    }
  };

  const openOrderEntry = (tableNum: number | null) => {
    setSelectedTable(tableNum === null ? 'bar' : tableNum);
    setCart([]);
    setOrderNotes('');
    setActiveCategory('all');
    setSearchQuery('');
    setConfirmOccupied(null);
    setStep('order-entry');
  };

  // ── Menu ─────────────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((item) => item.category));
    return ['all', ...Array.from(cats)];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    let items = menuItems.filter((item) => item.isAvailable);
    if (activeCategory !== 'all') items = items.filter((i) => i.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q)
      );
    }
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

  const handlePrintLastReceipt = () => {
    if (!lastPlacedOrder || isPrintingReceipt) return;
    setReceiptNote('');
    setShowReceiptNoteModal(true);
  };

  const confirmPrintLastReceipt = () => {
    if (!lastPlacedOrder || isPrintingReceipt) return;
    setIsPrintingReceipt(true);
    try {
      const combinedNotes = [lastPlacedOrder.notes?.trim() || '', receiptNote.trim()]
        .filter(Boolean)
        .join('\n');
      const html = buildReceiptHtml(
        orderToReceiptData(lastPlacedOrder, {
          restaurantName: restaurantName || 'Company',
          restaurantAddress: restaurantInfo?.address || '',
          restaurantPhone: restaurantInfo?.phone || '',
          restaurantEmail: restaurantInfo?.email || '',
          restaurantLogo: restaurantInfo?.logo,
          restaurantCity: restaurantInfo?.city,
          restaurantCountry: restaurantInfo?.country,
          taxRate: 0,
          serverName: selectedStaffName || resolveStaffName(),
          orderType: lastPlacedOrder.tableNumber == null ? 'takeout' : 'dine-in',
          paymentStatus: 'pending',
          payments: [{ method: 'Pending', amount: 0 }],
          notes: combinedNotes || undefined,
        })
      );
      printReceipt(html);
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
    setStep('table-select');
    if (sharedTerminalMode) {
      setSelectedStaffId('');
    }
    loadOccupancy();
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (sharedTerminalMode && !selectedStaffId) {
      alert('Select the active waiter before placing an order.');
      return;
    }
    setIsSubmitting(true);
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
      const created = await createOrder({
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
      } as any);

      const nowIso = new Date().toISOString();
      const subtotal = checkoutCart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
      const printableOrder: Order = {
        id: String((created as any)?.id || `order-${Date.now()}`),
        orderNumber: (created as any)?.orderNumber ?? (created as any)?.order_number,
        tableNumber: tableNum,
        status: 'pending',
        items: checkoutCart.map((c, index) => ({
          id: `item-${Date.now()}-${index}`,
          menuItem: c.menuItem,
          menuItemId: c.menuItemId,
          menuItemName: c.menuItemName,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          totalPrice: c.unitPrice * c.quantity,
          specialInstructions: c.notes || undefined,
          status: 'pending',
        })),
        createdAt: (created as any)?.createdAt ?? (created as any)?.created_at ?? nowIso,
        updatedAt: (created as any)?.updatedAt ?? (created as any)?.updated_at ?? nowIso,
        subtotal,
        tax: 0,
        total: Number((created as any)?.total ?? subtotal),
        notes: visibleNotes || undefined,
        requiresKitchen: needsKitchen,
      };

      const label = selectedTable === 'bar' ? 'Bar / Walk-up' : `Table ${selectedTable}`;
      setSuccessTable(label);
      setLastPlacedOrder(printableOrder);
      setCart([]);
      setOrderNotes('');
      setShowMobileCart(false);
    } catch (e) {
      console.error(e);
      alert('Failed to place order. Please try again.');
    } finally {
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
      <div className="min-h-screen bg-slate-950 p-4 md:p-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 md:p-8 shadow-2xl">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">Shared Terminal</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Select waiter to start taking orders</h1>
            <p className="mt-2 text-sm text-slate-400">
              Use this counter device as a shared waiter terminal. Orders will be saved under the selected waiter and the session resets after each completed order.
            </p>
          </div>

          {staffLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-8 text-center text-slate-400">Loading waiters...</div>
          ) : staffOptions.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-amber-200">
              No waiter accounts are available. Add waiter staff records before using the shared terminal.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {staffOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedStaffId(option.id)}
                  className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-5 text-left transition-colors hover:border-amber-500 hover:bg-slate-800/90"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{option.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{option.role || 'waiter'}</p>
                    </div>
                    <div className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                      Start session
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
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
            onClick={() => openOrderEntry(null)}
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
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
              {[...tables].sort((a, b) => a - b).map((tNum) => (
                <button
                  key={tNum}
                  onClick={() => confirmAndSelectTable(tNum)}
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 py-4 font-bold text-lg transition-all ${tableStatusClasses(tNum)}`}
                >
                  <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${tableStatusDot(tNum)}`} />
                  {tNum}
                  <span className="text-xs font-normal opacity-70 mt-0.5">
                    {tableOccupancy[tNum] === 'urgent' ? 'urgent' : tableOccupancy[tNum] === 'occupied' ? 'busy' : 'free'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Occupied confirmation dialog */}
        {confirmOccupied !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                  <UtensilsIcon className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Table {confirmOccupied} is occupied</h3>
                  <p className="text-sm text-slate-400">This table already has active orders.</p>
                </div>
              </div>
              <p className="mb-6 text-sm text-slate-300">
                Do you want to add a new order to Table {confirmOccupied}?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmOccupied(null)}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => openOrderEntry(confirmOccupied)}
                  className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
                >
                  Add Order
                </button>
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
              onClick={() => { setStep('table-select'); setCart([]); }}
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
                  {tableOccupancyStatus === 'urgent' ? 'Urgent — orders waiting >15 min' : 'Table occupied — adding to existing orders'}
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
      </div>

      <div className="max-w-6xl mx-auto flex gap-0 md:gap-6 p-0 md:p-4">

        {/* ── Menu panel ── */}
        <div className="flex-1 min-w-0 p-4 md:p-0">

          {/* Search */}
          <div className="relative mb-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search menu..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Category tabs */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>

          {/* Menu items */}
          {menuLoading ? (
            <div className="py-16 text-center text-slate-500">Loading menu...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-500">No items found</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => {
                const qty = getCartQty(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3 hover:border-slate-600 transition-colors"
                  >
                    {item.emoji && (
                      <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-amber-400 font-medium">{formatPrice(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {qty > 0 ? (
                        <>
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                          >
                            <MinusIcon className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-white">{qty}</span>
                          <button
                            onClick={() => addToCart(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                        >
                          <PlusIcon className="w-4 h-4" />
                        </button>
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
            tableLabel={tableLabel}
            sharedTerminalMode={sharedTerminalMode}
            canPrintReceipt={Boolean(lastPlacedOrder)}
            isPrintingReceipt={isPrintingReceipt}
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
              tableLabel={tableLabel}
              sharedTerminalMode={sharedTerminalMode}
              canPrintReceipt={Boolean(lastPlacedOrder)}
              isPrintingReceipt={isPrintingReceipt}
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
  tableLabel,
  sharedTerminalMode,
  canPrintReceipt,
  isPrintingReceipt,
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
  tableLabel: string;
  sharedTerminalMode: boolean;
  canPrintReceipt: boolean;
  isPrintingReceipt: boolean;
  onUpdateQty: (id: string, delta: number) => void;
  onNotesChange: (v: string) => void;
  onSelectedStaffIdChange: (v: string) => void;
  onSubmit: () => void;
  onPrintReceipt: () => void;
  onDone: () => void;
}) {
  if (successTable) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <CheckCircleIcon className="w-14 h-14 text-emerald-400" />
        <p className="font-bold text-lg text-white">Order placed!</p>
        <p className="text-sm text-slate-400">{successTable}</p>
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
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white">
            <ShoppingCartIcon className="inline w-4 h-4 mr-1.5 text-amber-400" />
            Cart
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

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Order Notes
        </label>
        <textarea
          value={orderNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Allergies, special requests..."
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none resize-none"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={cart.length === 0 || isSubmitting}
        className="w-full rounded-xl bg-amber-500 py-3.5 font-bold text-slate-900 hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? 'Placing order...'
          : cart.length === 0
            ? 'Add items to order'
            : `Place Order — ${formatPrice(cartTotal)}`}
      </button>
      <p className="text-center text-xs text-slate-500">{tableLabel}</p>
    </div>
  );
}
