import { useCallback, useState, useEffect, useRef } from 'react';
import { saveOfflineProfile } from './utils/offlineAuth';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, QrCodeIcon, LogOutIcon, ChevronDownIcon } from 'lucide-react';
import { CartItem, OrderStatus, Customer } from './types';
import type { ConfirmMergeFn } from './hooks/useOrders';
import { setCurrency, CurrencyCode } from './utils/currency';
import { OrdersProvider, useOrdersContext } from './contexts/OrdersContext';
import { useTables } from './hooks/useTables';
import { callWaiter } from './api/tables';
import { logoutStaff } from './api/auth';
import { CustomerApp } from './pages/customer/CustomerApp';
import { WaiterDashboard } from './pages/waiter/WaiterDashboard';
import { SupervisorDashboard } from './pages/supervisor/SupervisorDashboard';
import { RevenueReports } from './pages/supervisor/RevenueReports';
import { StaffPerformance } from './pages/supervisor/StaffPerformance';
import { OrderHistoryPage } from './pages/supervisor/OrderHistoryPage';
import { PaymentApprovalPanel } from './components/supervisor/PaymentApprovalPanel';
import { AttendancePanel } from './components/supervisor/AttendancePanel';
import { OnlineOrdersPage } from './pages/supervisor/OnlineOrdersPage';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { MenuManagement } from './pages/manager/MenuManagement';
import { StaffManagement } from './pages/manager/StaffManagement';
import { AnalyticsPage } from './pages/manager/AnalyticsPage';
import { QRCodeGenerator } from './pages/manager/QRCodeGenerator';
import CreditManagement from './pages/manager/CreditManagement';
import { LoyaltyManagement } from './pages/manager/LoyaltyManagement';
import { PromotionsManagement } from './pages/manager/PromotionsManagement';
import { ReservationsPage } from './pages/manager/ReservationsPage';
import { SchedulingPage } from './pages/manager/SchedulingPage';
import { ReviewsPage } from './pages/manager/ReviewsPage';
import ExpenseApproval from './components/manager/ExpenseApproval';
import { OrderCancellationRequestsPanel } from './components/manager/OrderCancellationRequestsPanel';
import SupervisorExpenseManagement from './components/supervisor/ExpenseManagement';
import { InventoryManagement } from './pages/shared/InventoryManagement';
import { KitchenDisplay } from './pages/kitchen/KitchenDisplay';
import { LoginPage } from './pages/auth/LoginPage';
import { SuperAdminDashboard } from './pages/superadmin/SuperAdminDashboard';
import { SupplierLoginPage } from './pages/supplier/SupplierLoginPage';
import { SupplierDashboard } from './pages/supplier/SupplierDashboard';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Staff } from './types';
import { SupplierUser, getSupplierMe, clearSupplierToken } from './api/supplier';
import { fetchRestaurantPublic, fetchReceiptSettings, type OutletType } from './api/restaurants';
import type { RestaurantReceiptSettings } from './api/restaurants';
import { MinimartApp } from './pages/minimart/MinimartApp';
import { RestaurantSettings } from './pages/manager/RestaurantSettings';
import { EbmSettings } from './pages/manager/EbmSettings';
import { ReportsPage } from './pages/manager/ReportsPage';
import { StaffOrderPage } from './pages/shared/StaffOrderPage';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { usePullToRefresh } from './hooks/usePullToRefresh';

type UserRole = 'customer' | 'waiter' | 'cashier' | 'supervisor' | 'manager' | 'kitchen' | 'superadmin' | 'supplier' | null;
type ManagerPage = 'dashboard' | 'menu' | 'staff' | 'analytics' | 'performance' | 'qrcodes' | 'inventory' | 'history' | 'expenses' | 'payment-cancellations' | 'credit' | 'loyalty' | 'promotions' | 'reservations' | 'scheduling' | 'reviews' | 'settings' | 'ebm' | 'reports';
type SupervisorPage = 'dashboard' | 'revenue' | 'staff' | 'qrcodes' | 'inventory' | 'history' | 'expenses' | 'online-orders' | 'payments' | 'attendance' | 'take-order';

const MANAGER_NAV_GROUPS: Array<{
  id: string;
  label: string;
  items: Array<{ id: ManagerPage; label: string }>;
}> = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'history', label: 'Order History' },
      { id: 'reservations', label: 'Reservations' },
      { id: 'reviews', label: 'Reviews' },
    ],
  },
  {
    id: 'marketing',
    label: 'Menu & Marketing',
    items: [
      { id: 'menu', label: 'Manage Menu' },
      { id: 'promotions', label: 'Promotions' },
      { id: 'loyalty', label: 'Loyalty & SMS' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { id: 'analytics', label: 'Analytics' },
      { id: 'reports', label: 'Reports' },
      { id: 'expenses', label: 'Expenses' },
      { id: 'payment-cancellations', label: 'Cancellation Requests' },
      { id: 'credit', label: 'Credit' },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    items: [
      { id: 'staff', label: 'Staff' },
      { id: 'scheduling', label: 'Schedule' },
      { id: 'qrcodes', label: 'QR Codes' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'settings', label: 'Settings' },
      { id: 'ebm', label: 'Fiscal (EBM)' },
    ],
  },
];

const MANAGER_NAV_FLAT: Array<{ id: ManagerPage; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  ...MANAGER_NAV_GROUPS.flatMap((g) => g.items),
];

export function App() {
  usePullToRefresh();
  const servvLogo = '/assets/logo_servv_white.PNG';
  const [selectedRole, setSelectedRole] = useState<UserRole>(null);
  const [authUser, setAuthUser] = useState<Staff | null>(null);
  const [supplierUser, setSupplierUser] = useState<SupplierUser | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>('');
  const [outletType, setOutletType] = useState<OutletType>(() => (localStorage.getItem('outletType') as OutletType) || 'restaurant');
  const [receiptSettings, setReceiptSettings] = useState<RestaurantReceiptSettings>({});
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [customerInitialTab, setCustomerInitialTab] = useState<'menu' | 'reserve'>('menu');
  const [managerPage, setManagerPage] = useState<ManagerPage>('dashboard');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [supervisorPage, setSupervisorPage] =
  useState<SupervisorPage>('dashboard');
  const [routeResolved, setRouteResolved] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningTable, setScanningTable] = useState<number | null>(null);
  const [detectedTable, setDetectedTable] = useState<number | null>(null);
  const [showQRGrid, setShowQRGrid] = useState(false);
  const [portalSplash, setPortalSplash] = useState<{ name: string; outletType: OutletType } | null>(null);
  const justLoggedIn = useRef(false);
  const [outletTypeResolved, setOutletTypeResolved] = useState(true);
  const { tables, addTable, removeTable } = useTables();

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
  }, [selectedRole, tableNumber]);

  useEffect(() => {
    if (selectedRole) {
      localStorage.setItem('selectedRole', selectedRole);
    } else {
      localStorage.removeItem('selectedRole');
    }
    window.dispatchEvent(new Event('portal-role-changed'));
  }, [selectedRole]);

  const restoreStaffContextFromAuthUser = useCallback((user: Staff | null) => {
    if (!user) {
      return;
    }

    if (user.id) {
      const storedStaffId = localStorage.getItem('staffId');
      if (!storedStaffId) {
        localStorage.setItem('staffId', user.id);
      }
    }

    if (user.role) {
      const storedStaffRole = localStorage.getItem('staffRole');
      if (!storedStaffRole) {
        localStorage.setItem('staffRole', user.role);
      }
    }
  }, []);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isValidUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

    const savedAuthUser = localStorage.getItem('authUser');
    const savedSelectedRole = localStorage.getItem('selectedRole');
    const savedRestaurantId = localStorage.getItem('restaurantId');
    if (savedAuthUser) {
      try {
        const user = JSON.parse(savedAuthUser);
        const rawId = user.restaurantId || user.restaurant_id || savedRestaurantId || null;
        // Reject legacy non-UUID restaurant IDs — user must re-login to get a fresh UUID
        const restoredRestaurantId = isValidUuid(rawId) ? rawId : null;
        if (!restoredRestaurantId && rawId) {
          console.warn('[auth] Legacy restaurant ID detected — clearing session to force re-login:', rawId);
          localStorage.removeItem('authUser');
          localStorage.removeItem('selectedRole');
          localStorage.removeItem('restaurantId');
          localStorage.removeItem('staffId');
          localStorage.removeItem('staffRole');
          setRouteResolved(true);
          return;
        }
        if (restoredRestaurantId && !user.restaurantId) {
          user.restaurantId = restoredRestaurantId;
        }
        setAuthUser(user);
        restoreStaffContextFromAuthUser(user);
        if (restoredRestaurantId) {
          setCurrentRestaurantId(restoredRestaurantId);
          localStorage.setItem('restaurantId', restoredRestaurantId);
        }
        if (!savedSelectedRole && user.role) {
          setSelectedRole(user.role as UserRole);
        }
      } catch (error) {
        console.error('Failed to parse saved auth user:', error);
        localStorage.removeItem('authUser');
      }
    } else if (savedRestaurantId) {
      setCurrentRestaurantId(savedRestaurantId);
    }
    if (savedSelectedRole) {
      setSelectedRole(savedSelectedRole as UserRole);
    }
    setRouteResolved(true);
  }, [restoreStaffContextFromAuthUser]);

  const [waiterCalls, setWaiterCalls] = useState<
    {
      tableNumber: number;
      timestamp: Date;
    }[]>(
    []);
  const { orders, addOrder, updateOrderStatus } = useOrdersContext();

  const handleCallWaiter = useCallback((tableNum: number) => {
    // Add to local state first for immediate UI feedback
    setWaiterCalls((prev) => [
    ...prev,
    {
      tableNumber: tableNum,
      timestamp: new Date()
    }]
    );
    
    // Also call backend API to notify waiters via socket
    callWaiter(tableNum).catch((err) => {
      console.warn('Failed to call waiter via API:', err);
    });
  }, []);

  const handlePlaceOrder = useCallback(
    async (tableNum: number, items: CartItem[], specialInstructions?: string, customer?: Customer | null, delivery?: { provider: string; address: string }, loyaltyRewardId?: string, promotionCode?: string, confirmMerge?: ConfirmMergeFn) => {
      await addOrder(tableNum, items, specialInstructions, customer, delivery, loyaltyRewardId, promotionCode, confirmMerge);
      handleCallWaiter(tableNum);
    },
    [addOrder, handleCallWaiter]
  );
  
  const handleUpdateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      updateOrderStatus(orderId, status, opts);
    },
    [updateOrderStatus]
  );
  
  const handleDismissWaiterCall = useCallback((tableNum: number) => {
    setWaiterCalls((prev) =>
    prev.filter((call) => call.tableNumber !== tableNum)
    );
  }, []);

  const persistRestaurantContext = useCallback((restaurantId: string) => {
    localStorage.setItem('restaurantId', restaurantId);
    setCurrentRestaurantId(restaurantId);
    window.dispatchEvent(new Event('restaurantIdChanged'));
  }, []);

  const handleGoSupplierPortal = () => {
    setSelectedRole('supplier');
    window.history.pushState({}, '', '/supplier');
  };

  const isSameDay = (value: Date | string | undefined, dayStart: Date) => {
    if (!value) return false;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return false;
    return dt >= dayStart;
  };

  const isPaymentConfirmed = (order: any) =>
    order.paymentStatus === 'confirmed' || order.payment_status === 'confirmed';

  const managerActiveOrders = orders.filter((order) => ['pending', 'verified', 'preparing', 'ready'].includes(order.status)).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const managerTotalOrders = orders.filter((order) => isSameDay(order.createdAt, today)).length;
  const managerServedOrders = orders.filter(
    (order) =>
      order.status === 'served' &&
      (isSameDay(order.servedAt, today) || isSameDay(order.updatedAt, today) || isSameDay(order.createdAt, today))
  ).length;

  // Revenue only counts orders with confirmed payment
  const managerTodaysRevenue = orders
    .filter(
      (order) =>
        isPaymentConfirmed(order) &&
        (isSameDay((order as any).paymentConfirmedAt ?? (order as any).payment_confirmed_at ?? order.updatedAt, today) ||
         isSameDay(order.createdAt, today))
    )
    .reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0);

  // Payment pending / confirmed counts (all time, for dashboard cards)
  const pendingPaymentOrders = orders.filter(
    (order) => !isPaymentConfirmed(order) && order.status !== 'cancelled'
  );
  const confirmedPaymentOrders = orders.filter(isPaymentConfirmed);
  const pendingPaymentTotal = pendingPaymentOrders.reduce((s, o) => s + (typeof o.total === 'number' ? o.total : 0), 0);
  const confirmedPaymentTotal = confirmedPaymentOrders.reduce((s, o) => s + (typeof o.total === 'number' ? o.total : 0), 0);

  const getHourKey = (date: Date) => `${date.getHours().toString().padStart(2, '0')}:00`;
  const chartHours = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date();
    dt.setHours(dt.getHours() - (11 - i), 0, 0, 0);
    return dt;
  });

  const ordersByHour = chartHours.map((hourDate) => {
    const hourStart = new Date(hourDate);
    const hourEnd = new Date(hourDate);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const ordersInHour = orders.filter((order) => {
      const created = new Date(order.createdAt);
      return created >= hourStart && created < hourEnd;
    });

    return {
      hour: getHourKey(hourDate),
      orders: ordersInHour.length,
      // Only payment-confirmed orders count as realised revenue
      revenue: ordersInHour
        .filter(isPaymentConfirmed)
        .reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0),
    };
  });

  const statusBreakdown = [
    { status: 'pending', count: orders.filter((o) => o.status === 'pending').length },
    { status: 'verified', count: orders.filter((o) => o.status === 'verified').length },
    { status: 'preparing', count: orders.filter((o) => o.status === 'preparing').length },
    { status: 'ready', count: orders.filter((o) => o.status === 'ready').length },
    { status: 'served', count: orders.filter((o) => o.status === 'served').length },
  ];

  const handleBack = () => {

    if (selectedRole === 'customer') {
      // Go to home page (root)
      window.history.pushState({}, '', '/');
    }
    if (selectedRole === 'manager' && managerPage !== 'dashboard') {
      setManagerPage('dashboard');
      return;
    }

    if (selectedRole && selectedRole !== 'customer') {
      if (selectedRole === 'supplier') {
        clearSupplierToken();
        setSupplierUser(null);
      } else {
        logoutStaff();
      }

      setSelectedRole(null);
      setAuthUser(null);
      // Clear localStorage
      localStorage.removeItem('authUser');
      localStorage.removeItem('selectedRole');
      localStorage.removeItem('restaurantId');
      localStorage.removeItem('outletType');
      setRestaurantName('');
      setOutletType('restaurant');
      setCurrentRestaurantId(null); // clear so useEffect re-fires on next login
      setOutletTypeResolved(true);
      setTableNumber(null);
      setManagerPage('dashboard');
      setSupervisorPage('dashboard');
      setIsScanning(false);
      setDetectedTable(null);
      window.history.pushState({}, '', '/');
    }
  };

  const handleLogout = () => {
    if (selectedRole === 'supplier') {
      clearSupplierToken();
      setSupplierUser(null);
    } else {
      logoutStaff();
    }

    setSelectedRole(null);
    setAuthUser(null);
    localStorage.removeItem('authUser');
    localStorage.removeItem('selectedRole');
    localStorage.removeItem('restaurantId');
    localStorage.removeItem('outletType');
    setRestaurantName('');
    setOutletType('restaurant');
    setCurrentRestaurantId(null); // clear so useEffect re-fires on next login
    setOutletTypeResolved(true);
    setTableNumber(null);
    setManagerPage('dashboard');
    setSupervisorPage('dashboard');
    setIsScanning(false);
    setDetectedTable(null);
    window.history.pushState({}, '', '/');
  };

  const handleScanQR = (tableNum?: number) => {
    // if explicit table number provided use it, else pick random from known tables or fall back to 1..20 range
    let targetTable: number;
    if (tableNum !== undefined) {
      targetTable = tableNum;
    } else if (tables.length > 0) {
      targetTable = tables[Math.floor(Math.random() * tables.length)];
    } else {
      targetTable = Math.floor(Math.random() * 20) + 1;
    }
    setIsScanning(true);
    setScanningTable(targetTable);
    setDetectedTable(null);
    // Simulate scanning delay
    setTimeout(() => {
      setIsScanning(false);
      setDetectedTable(targetTable);
      // Brief "detected" display, then navigate
      setTimeout(() => {
        setSelectedRole('customer');
        setCustomerInitialTab('menu');
        setTableNumber(targetTable);
        // update URL so it matches what a real scan would point to
        window.history.pushState({}, '', `/t/${targetTable}`);
        setDetectedTable(null);
        setScanningTable(null);
        setShowQRGrid(false);
      }, 1200);
    }, 1500);
  };
  // check for table number in path (deep linking via QR code)
  // and also check for role-based URLs like /waiter, /kitchen, etc.
  useEffect(() => {
    const path = window.location.pathname;
    const query = new URLSearchParams(window.location.search);

    // Check for direct reservation deep-link: /r/:restaurantId/t/:table/reserve
    const reserveMatch = path.match(/^\/r\/([^/]+)\/t\/(\d+)\/reserve\/?$/);
    if (reserveMatch) {
      const parsedRestaurantId = decodeURIComponent(reserveMatch[1]);
      const num = parseInt(reserveMatch[2], 10);
      if (!isNaN(num)) {
        persistRestaurantContext(parsedRestaurantId);
        setSelectedRole('customer');
        setCustomerInitialTab('reserve');
        setTableNumber(num);
        setRouteResolved(true);
        return;
      }
    }

    // Check for restaurant-specific table QR code path: /r/:restaurantId/t/:table
    const restaurantTableMatch = path.match(/^\/r\/([^/]+)\/t\/(\d+)\/?$/);
    if (restaurantTableMatch) {
      const parsedRestaurantId = decodeURIComponent(restaurantTableMatch[1]);
      const num = parseInt(restaurantTableMatch[2], 10);
      if (!isNaN(num)) {
        persistRestaurantContext(parsedRestaurantId);
        setSelectedRole('customer');
        setCustomerInitialTab('menu');
        setTableNumber(num);
        setRouteResolved(true);
        return;
      }
    }

    // Check for query table: ?table=123
    const queryTable = query.get('table');
    const existingRestaurantId = localStorage.getItem('restaurantId');
    if (queryTable) {
      const num = parseInt(queryTable, 10);
      if (!isNaN(num)) {
        const restaurantIdFromQuery = query.get('restaurantId');
        if (restaurantIdFromQuery) {
          persistRestaurantContext(restaurantIdFromQuery);
        }
        setSelectedRole('customer');
        setCustomerInitialTab('menu');
        setTableNumber(num);
        setRouteResolved(true);
        return;
      }
    }

    // Check for simple reservation deep-link: /t/:table/reservation (or /reserve)
    const simpleReserveMatch = path.match(/^\/t\/(\d+)\/(reservation|reserve)\/?$/);
    if (simpleReserveMatch) {
      const num = parseInt(simpleReserveMatch[1], 10);
      if (!isNaN(num)) {
        const restaurantIdFromQuery = query.get('restaurantId');
        if (restaurantIdFromQuery) persistRestaurantContext(restaurantIdFromQuery);
        setSelectedRole('customer');
        setCustomerInitialTab('reserve');
        setTableNumber(num);
        setRouteResolved(true);
        return;
      }
    }

    // Check for table QR code path: /t/123
    const tableMatch = path.match(/^\/t\/(\d+)/);
    if (tableMatch) {
      const num = parseInt(tableMatch[1], 10);
      if (!isNaN(num)) {
        const restaurantIdFromQuery = query.get('restaurantId');
        if (restaurantIdFromQuery) {
          persistRestaurantContext(restaurantIdFromQuery);
        }
        setSelectedRole('customer');
        setCustomerInitialTab('menu');
        setTableNumber(num);
        setRouteResolved(true);
        return;
      }
    }

    // Check for role-based URLs
    if (path === '/waiter' || path.startsWith('/waiter')) {
      setSelectedRole('waiter');
      setRouteResolved(true);
      return;
    } else if (path === '/kitchen' || path.startsWith('/kitchen')) {
      setSelectedRole('kitchen');
      setRouteResolved(true);
      return;
    } else if (path === '/minimart' || path.startsWith('/minimart')) {
      const savedRole = localStorage.getItem('selectedRole') as UserRole;
      setSelectedRole(savedRole || 'manager');
      setRouteResolved(true);
      return;
    } else if (path === '/manager' || path.startsWith('/manager')) {
      setSelectedRole('manager');
      setRouteResolved(true);
      return;
    } else if (path === '/supervisor' || path.startsWith('/supervisor')) {
      setSelectedRole('supervisor');
      setRouteResolved(true);
      return;
    } else if (path === '/supplier' || path.startsWith('/supplier')) {
      setSelectedRole('supplier');
      setRouteResolved(true);
      return;
    } else if (path === '/superadmin' || path.startsWith('/superadmin')) {
      setSelectedRole('superadmin');
      setRouteResolved(true);
      return;
    }

    // Unknown path fallback — restore saved role if available, otherwise show login
    window.history.replaceState({}, '', '/');
    const savedRole = localStorage.getItem('selectedRole');
    if (savedRole) {
      setSelectedRole(savedRole as UserRole);
    } else {
      setSelectedRole(null);
    }
    setRouteResolved(true);
  }, []);

  // Auto-open the sidebar group that contains the active manager page
  useEffect(() => {
    for (const group of MANAGER_NAV_GROUPS) {
      if (group.items.some((item) => item.id === managerPage)) {
        setOpenGroups((prev) => prev.has(group.id) ? prev : new Set([...prev, group.id]));
        break;
      }
    }
  }, [managerPage]);

  // Update URL when role changes
  useEffect(() => {
    if (selectedRole && selectedRole !== 'customer') {
      window.history.replaceState({}, '', `/${selectedRole}`);
    }
  }, [selectedRole]);

  // Override URL to /minimart when in minimart context (runs after role effect)
  useEffect(() => {
    if (authUser && (outletType === 'minimart' || selectedRole === 'cashier')) {
      window.history.replaceState({}, '', '/minimart');
    }
  }, [authUser, outletType, selectedRole]);

  useEffect(() => {
    if (selectedRole !== 'supplier') {
      return;
    }

    const token = localStorage.getItem('supplier_token');
    if (!token || supplierUser) {
      return;
    }

    let active = true;
    getSupplierMe()
      .then((user) => {
        if (!active) return;
        setSupplierUser(user);
      })
      .catch(() => {
        if (!active) return;
        setSupplierUser(null);
      });

    return () => {
      active = false;
    };
  }, [selectedRole, supplierUser]);

  useEffect(() => {
    let active = true;
    if (!currentRestaurantId) {
      setRestaurantName('');
      return;
    }

    fetchRestaurantPublic(currentRestaurantId)
      .then((restaurant) => {
        if (!active) return;
        const name = restaurant.name || '';
        setRestaurantName(name);
        const ot = ((restaurant as any).outlet_type || 'restaurant') as OutletType;
        setOutletType(ot);
        setOutletTypeResolved(true);
        localStorage.setItem('outletType', ot);
        if (justLoggedIn.current) {
          justLoggedIn.current = false;
          setPortalSplash({ name, outletType: ot });
        }
      })
      .catch((err: unknown) => {
        console.warn('Failed to fetch restaurant info:', err);
        if (active) {
          setRestaurantName('');
          setOutletType('restaurant'); // safe fallback — don't leave a stale 'minimart' from localStorage
          setOutletTypeResolved(true);
        }
      });

    fetchReceiptSettings(currentRestaurantId)
      .then((s) => {
        if (!active) return;
        setReceiptSettings(s);
        if (s.currency) setCurrency(s.currency as CurrencyCode);
      })
      .catch(() => {/* non-fatal */});

    return () => {
      active = false;
    };
  }, [currentRestaurantId]);

  useEffect(() => {
    if (!portalSplash) return;
    const timer = setTimeout(() => setPortalSplash(null), 2500);
    return () => clearTimeout(timer);
  }, [portalSplash]);

  if (!routeResolved) {
    return null;
  }

  // Customer portal (table already assigned via QR scan)
  if (selectedRole === 'customer' && tableNumber !== null) {
    return (
      <div className="relative">
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 md:top-6 md:left-6 z-50 p-2 rounded-full bg-white/90 shadow-md text-slate-600"
          aria-label="Back">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <CustomerApp
          tableNumber={tableNumber}
          orders={orders}
          restaurantName={restaurantName}
          restaurantId={currentRestaurantId || undefined}
          initialTab={customerInitialTab}
          onPlaceOrder={handlePlaceOrder}
          onCallWaiter={() => handleCallWaiter(tableNumber)}
        />
      </div>
    );
  }

  // Supplier portal
  if (selectedRole === 'supplier' && !supplierUser) {
    return <SupplierLoginPage onLogin={(user) => setSupplierUser(user)} onBack={handleBack} />;
  }

  if (selectedRole === 'supplier' && supplierUser) {
    return <SupplierDashboard user={supplierUser} onLogout={handleBack} />;
  }

  // Cashier is a minimart-only role — route immediately without waiting for outletType fetch
  if (selectedRole === 'cashier' && authUser && currentRestaurantId) {
    return (
      <MinimartApp
        restaurantId={currentRestaurantId}
        restaurantName={restaurantName}
        authUser={authUser}
        onLogout={handleLogout}
      />
    );
  }

  // Wait for outlet type fetch to complete before routing manager/supervisor
  if (!outletTypeResolved && authUser && (selectedRole === 'manager' || selectedRole === 'supervisor')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  // Minimart portal — manager/supervisor on a minimart outlet
  if (authUser && outletType === 'minimart' && currentRestaurantId) {
    return (
      <MinimartApp
        restaurantId={currentRestaurantId}
        restaurantName={restaurantName}
        authUser={authUser}
        onLogout={handleLogout}
      />
    );
  }

  // Waiter portal
  if (selectedRole === 'waiter' && authUser) {
    return (
      <WaiterDashboard
        waiter={authUser}
        orders={orders}
        restaurantName={restaurantName}
        restaurantInfo={receiptSettings}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        onCreateOrder={handlePlaceOrder}
        waiterCalls={waiterCalls}
        onDismissWaiterCall={handleDismissWaiterCall}
        onLogout={handleBack}
      />
    );

  }
  // Supervisor portal
  if (selectedRole === 'supervisor' && authUser) {
    return (
      <div className="supervisor-surface min-h-screen bg-slate-900 text-slate-100 transition-colors">
        {/* Fixed Header with Back Button */}
        <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
                aria-label="Back"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              {receiptSettings.logo && (
                <img src={receiptSettings.logo} alt="logo" className="h-8 w-auto object-contain rounded" />
              )}
              <div>
                <div className="text-xs sm:text-sm text-slate-300 uppercase tracking-wider">Supervisor Portal</div>
                <div className="text-base sm:text-lg font-semibold">Welcome, {authUser.name}</div>
                <div className="text-xs sm:text-sm text-slate-400">{restaurantName || 'Company'}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-slate-700/60 hover:bg-red-600 text-slate-200 hover:text-white transition-colors"
                  aria-label="Logout"
                >
                  <LogOutIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 px-4 pb-4">
          <div className="max-w-6xl mx-auto flex gap-2 py-4 overflow-x-auto">
            <Button
              variant={supervisorPage === 'dashboard' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('dashboard')}
            >
              Dashboard
            </Button>
            <Button
              variant={supervisorPage === 'revenue' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('revenue')}
            >
              Revenue
            </Button>
            <Button
              variant={supervisorPage === 'staff' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('staff')}
            >
              Staff
            </Button>
            <Button
              variant={supervisorPage === 'qrcodes' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('qrcodes')}
            >
              QR Codes
            </Button>
            <Button
              variant={supervisorPage === 'inventory' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('inventory')}
            >
              Inventory
            </Button>
            <Button
              variant={supervisorPage === 'history' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('history')}
            >
              Order History
            </Button>
            <Button
              variant={supervisorPage === 'expenses' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('expenses')}
            >
              Expenses
            </Button>
            <Button
              variant={supervisorPage === 'online-orders' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('online-orders')}
              className="relative"
            >
              Online Orders
              {orders.filter((o: any) => (o.isOnlineOrder || o.is_online_order || o.tableNumber === 999 || o.table_number === 999) && o.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Button>
            <Button
              variant={supervisorPage === 'payments' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('payments')}
              className="relative"
            >
              Payments
              {orders.filter((o: any) => (o.paymentStatus ?? o.payment_status) !== 'confirmed' && o.status !== 'cancelled').length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </Button>
            <Button
              variant={supervisorPage === 'attendance' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('attendance')}
            >
              Attendance
            </Button>
            <Button
              variant={supervisorPage === 'take-order' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSupervisorPage('take-order')}
            >
              Take Order
            </Button>
          </div>
        </div>

        {supervisorPage === 'dashboard' && (
          <SupervisorDashboard
            restaurantName={restaurantName}
            ordersByHour={ordersByHour}
            statusBreakdown={statusBreakdown}
            pendingPaymentCount={pendingPaymentOrders.length}
            pendingPaymentTotal={pendingPaymentTotal}
            confirmedPaymentCount={confirmedPaymentOrders.length}
            confirmedPaymentTotal={confirmedPaymentTotal}
          />
        )}
        {supervisorPage === 'revenue' && <RevenueReports />}
        {supervisorPage === 'staff' && <StaffPerformance onBack={() => setSupervisorPage('dashboard')} />}
        {supervisorPage === 'qrcodes' && (
          <QRCodeGenerator
            tables={tables}
            restaurantId={currentRestaurantId ?? undefined}
            restaurantName={restaurantName}
            onAddTable={addTable}
          />
        )}
        {supervisorPage === 'inventory' && <InventoryManagement role="supervisor" />}
        {supervisorPage === 'history' && (
          <OrderHistoryPage
            onBack={() => setSupervisorPage('dashboard')}
            existingOrders={orders}
            restaurantName={restaurantName}
            receiptSettings={receiptSettings}
          />
        )}
        {supervisorPage === 'expenses' && <SupervisorExpenseManagement />}
        {supervisorPage === 'online-orders' && <OnlineOrdersPage />}
        {supervisorPage === 'take-order' && (
          <StaffOrderPage
            restaurantName={restaurantName}
            restaurantInfo={receiptSettings}
            staffName={authUser.name}
            sharedTerminalMode
          />
        )}
        {supervisorPage === 'payments' && (
          <div className="p-4 md:p-6">
            <PaymentApprovalPanel
              restaurantId={authUser?.restaurantId || localStorage.getItem('restaurantId') || undefined}
              restaurantName={restaurantName}
              restaurantInfo={receiptSettings}
              staffId={authUser?.id}
              staffName={authUser?.name}
              orders={orders}
            />
          </div>
        )}
        {supervisorPage === 'attendance' && (
          <div className="p-4 md:p-6">
            <AttendancePanel
              restaurantId={authUser?.restaurantId || localStorage.getItem('restaurantId') || undefined}
            />
          </div>
        )}
      </div>
    );
  }
  // Manager portal
  if (selectedRole === 'manager' && authUser) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-slate-800/95 border-b border-slate-700">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200"
                aria-label="Back"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              {receiptSettings.logo && (
                <img
                  src={receiptSettings.logo}
                  alt="Company logo"
                  className="h-9 w-auto object-contain rounded"
                />
              )}
              <div>
                <div className="text-xs sm:text-sm text-slate-300 uppercase tracking-wider">Manager Portal</div>
                <div className="text-base sm:text-lg font-semibold">Welcome, {authUser.name}</div>
                <div className="text-xs sm:text-sm text-slate-400">{restaurantName || 'Company'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-700/60 hover:bg-red-600 text-slate-200 hover:text-white transition-colors"
                aria-label="Logout"
              >
                <LogOutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Side Menu */}
          <aside className="w-full lg:w-56 lg:min-h-[calc(100vh-73px)] bg-slate-800 border-r border-slate-700 p-3">
            {/* Mobile: flat horizontal scroll (unchanged behaviour) */}
            <nav className="flex lg:hidden overflow-x-auto gap-1 pb-1">
              {MANAGER_NAV_FLAT.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setManagerPage(item.id)}
                  className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-lg transition flex-shrink-0 ${
                    managerPage === item.id
                      ? 'bg-amber-500 text-slate-900'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Desktop: accordion groups */}
            <nav className="hidden lg:flex lg:flex-col gap-0.5">
              {/* Dashboard — standalone */}
              <button
                onClick={() => setManagerPage('dashboard')}
                className={`w-full px-3 py-2 text-left text-sm font-medium rounded-lg transition ${
                  managerPage === 'dashboard'
                    ? 'bg-amber-500 text-slate-900'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                Dashboard
              </button>

              {/* Collapsible groups */}
              {MANAGER_NAV_GROUPS.map((group) => {
                const isOpen = openGroups.has(group.id);
                const hasActive = group.items.some((i) => i.id === managerPage);
                return (
                  <div key={group.id}>
                    <button
                      onClick={() =>
                        setOpenGroups((prev) => {
                          const next = new Set(prev);
                          isOpen ? next.delete(group.id) : next.add(group.id);
                          return next;
                        })
                      }
                      className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium rounded-lg transition ${
                        hasActive
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span>{group.label}</span>
                      <ChevronDownIcon
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="mt-0.5 ml-2 pl-3 border-l border-slate-700 flex flex-col gap-0.5">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setManagerPage(item.id)}
                            className={`w-full px-3 py-1.5 text-left text-sm font-medium rounded-lg transition ${
                              managerPage === item.id
                                ? 'bg-amber-500 text-slate-900'
                                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 bg-slate-900 text-slate-100 p-4 lg:p-6 min-h-[calc(100vh-73px)] overflow-x-auto">
            {managerPage === 'dashboard' &&
              <ManagerDashboard
                onNavigate={(page) => setManagerPage(page as ManagerPage)}
                totalOrders={managerTotalOrders}
                activeOrders={managerActiveOrders}
                servedOrders={managerServedOrders}
                todaysRevenue={managerTodaysRevenue}
                ordersByHour={ordersByHour}
                statusBreakdown={statusBreakdown}
                pendingPaymentCount={pendingPaymentOrders.length}
                pendingPaymentTotal={pendingPaymentTotal}
                confirmedPaymentCount={confirmedPaymentOrders.length}
                confirmedPaymentTotal={confirmedPaymentTotal}
                restaurantId={currentRestaurantId ?? undefined}
              />
            }
            {managerPage === 'menu' && <MenuManagement />}
            {managerPage === 'staff' && <StaffManagement onShowPerformance={() => setManagerPage('performance')} />}
            {managerPage === 'analytics' && <AnalyticsPage />}
            {managerPage === 'reports' && <ReportsPage restaurantName={restaurantName} />}
            {managerPage === 'performance' && <StaffPerformance onBack={() => setManagerPage('staff')} />}
            {managerPage === 'inventory' && <InventoryManagement role="manager" />}
            {managerPage === 'qrcodes' && (
              <QRCodeGenerator
                tables={tables}
                restaurantId={currentRestaurantId ?? undefined}
                restaurantName={restaurantName}
                onAddTable={addTable}
                onDeleteTable={removeTable}
              />
            )}
            {managerPage === 'expenses' && <ExpenseApproval />}
            {managerPage === 'payment-cancellations' && (
              <OrderCancellationRequestsPanel
                restaurantId={authUser?.restaurantId || localStorage.getItem('restaurantId') || undefined}
                managerId={authUser?.id}
                managerName={authUser?.name}
              />
            )}
            {managerPage === 'credit' && <CreditManagement />}
            {managerPage === 'loyalty' && <LoyaltyManagement />}
            {managerPage === 'promotions' && <PromotionsManagement />}
            {managerPage === 'reservations' && <ReservationsPage />}
            {managerPage === 'scheduling' && <SchedulingPage />}
            {managerPage === 'reviews' && <ReviewsPage />}
            {managerPage === 'history' && (
              <OrderHistoryPage
                onBack={() => setManagerPage('dashboard')}
                existingOrders={orders}
                restaurantName={restaurantName}
                receiptSettings={receiptSettings}
              />
            )}
            {managerPage === 'settings' && currentRestaurantId && (
              <RestaurantSettings
                restaurantId={currentRestaurantId}
                restaurantName={restaurantName}
                onNameChange={(newName) => setRestaurantName(newName)}
                onSettingsSaved={(s) => setReceiptSettings(s)}
              />
            )}
            {managerPage === 'ebm' && currentRestaurantId && (
              <EbmSettings restaurantId={currentRestaurantId} />
            )}
          </main>
        </div>
      </div>
    );
  }

  // Kitchen portal (requires auth)
  if (selectedRole === 'kitchen' && authUser) {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Fixed Header with Back Button */}
        <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
                aria-label="Back"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              {receiptSettings.logo && (
                <img src={receiptSettings.logo} alt="logo" className="h-8 w-auto object-contain rounded" />
              )}
              <span className="text-white font-medium">Kitchen Display</span>
              <div className="ml-auto">
              </div>
            </div>
            <div className="text-sm text-slate-400">{restaurantName || 'Company'}</div>
          </div>
        </div>
        <KitchenDisplay
          onLogout={handleBack}
          restaurantId={currentRestaurantId ?? undefined}
          restaurantName={restaurantName}
        />
      </div>
    );
  }

  // Superadmin portal (requires auth)
  if (selectedRole === 'superadmin' && authUser) {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Fixed Header with Back Button */}
        <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
                aria-label="Back"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <span className="text-white font-medium">Superadmin Dashboard</span>
              <div className="ml-auto">
              </div>
            </div>
          </div>
        </div>
        <SuperAdminDashboard onNavigate={() => {}} />
      </div>
    );
  }

  // Login page (default landing page)
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 md:p-8">
      <InstallPrompt />
      <div className="w-full max-w-md">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center mb-4">
            <img src={servvLogo} alt="Servv IQ" className="h-14 w-auto object-contain" />
          </div>
          <p className="text-lg text-slate-400 max-w-sm mx-auto font-light">
            The operating system for hospitality
          </p>
        </motion.div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <LoginPage
              embedded
              onLogin={(user) => {
                justLoggedIn.current = true;
                if (user.role === 'manager' || user.role === 'supervisor') {
                  setOutletType('restaurant');
                  setOutletTypeResolved(false);
                }
                setAuthUser(user);
                restoreStaffContextFromAuthUser(user);
                setSelectedRole(user.role as UserRole);
                localStorage.setItem('authUser', JSON.stringify(user));
                localStorage.setItem('selectedRole', user.role);
                localStorage.setItem('staffId', user.id);
                localStorage.setItem('staffRole', user.role);
                const loginRestaurantId = user.restaurantId || (user as any).restaurant_id;
                if (loginRestaurantId) {
                  localStorage.setItem('restaurantId', loginRestaurantId);
                  setCurrentRestaurantId(loginRestaurantId);
                  window.dispatchEvent(new Event('restaurantIdChanged'));
                }

                // Cache profile for offline password auth (password hash saved in LoginPage)
                saveOfflineProfile(user, restaurantName || 'Restaurant');
              }}
              onBack={() => {}} />
        </motion.div>

        {/* Customer QR Scan Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 text-center"
        >
          <p className="text-slate-400 mb-4">
            Or scan QR code to order as a customer
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="px-6 py-2 rounded-full border-slate-700 text-slate-400 hover:text-amber-500 hover:border-amber-500/50"
              onClick={() => handleScanQR()}
            >
              <QrCodeIcon className="w-4 h-4 mr-2" />
              Scan QR Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-6 py-2 rounded-full border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500"
              onClick={handleGoSupplierPortal}
            >
              Supplier Portal
            </Button>

          </div>
        </motion.div>
      </div>

    </div>);

}