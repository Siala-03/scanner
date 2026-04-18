import { useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, QrCodeIcon, LogOutIcon } from 'lucide-react';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { CartItem, OrderStatus, Customer } from './types';
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
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { MenuManagement } from './pages/manager/MenuManagement';
import { StaffManagement } from './pages/manager/StaffManagement';
import { AnalyticsPage } from './pages/manager/AnalyticsPage';
import { QRCodeGenerator } from './pages/manager/QRCodeGenerator';
import CreditManagement from './pages/manager/CreditManagement';
import { LoyaltyManagement } from './pages/manager/LoyaltyManagement';
import ExpenseApproval from './components/manager/ExpenseApproval';
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
import { fetchRestaurantPublic, fetchReceiptSettings } from './api/restaurants';
import type { RestaurantReceiptSettings } from './api/restaurants';
import { RestaurantSettings } from './pages/manager/RestaurantSettings';

type UserRole = 'customer' | 'waiter' | 'supervisor' | 'manager' | 'kitchen' | 'superadmin' | 'supplier' | null;
type ManagerPage = 'dashboard' | 'menu' | 'staff' | 'analytics' | 'performance' | 'qrcodes' | 'inventory' | 'history' | 'expenses' | 'credit' | 'loyalty' | 'settings';
type SupervisorPage = 'dashboard' | 'revenue' | 'staff' | 'qrcodes' | 'inventory' | 'menu' | 'history' | 'expenses';
export function App() {
  const [selectedRole, setSelectedRole] = useState<UserRole>(null);
  const [authUser, setAuthUser] = useState<Staff | null>(null);
  const [supplierUser, setSupplierUser] = useState<SupplierUser | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>('');
  const [receiptSettings, setReceiptSettings] = useState<RestaurantReceiptSettings>({});
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [managerPage, setManagerPage] = useState<ManagerPage>('dashboard');
  const [supervisorPage, setSupervisorPage] =
  useState<SupervisorPage>('dashboard');
  const [routeResolved, setRouteResolved] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningTable, setScanningTable] = useState<number | null>(null);
  const [detectedTable, setDetectedTable] = useState<number | null>(null);
  const [showQRGrid, setShowQRGrid] = useState(false);
  const { tables, addTable, removeTable } = useTables();

  useEffect(() => {
    const root = document.documentElement;
    const isCustomerPortal = selectedRole === 'customer' && tableNumber !== null;

    if (isCustomerPortal) {
      // Customer menu has its own visual design; skip global light-mode remaps here.
      root.removeAttribute('data-theme');
      return;
    }

    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [selectedRole, tableNumber]);

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
    const savedAuthUser = localStorage.getItem('authUser');
    const savedSelectedRole = localStorage.getItem('selectedRole');
    const savedRestaurantId = localStorage.getItem('restaurantId');
    if (savedAuthUser) {
      try {
        const user = JSON.parse(savedAuthUser);
        const restoredRestaurantId = user.restaurantId || user.restaurant_id || savedRestaurantId || null;
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
    async (tableNum: number, items: CartItem[], specialInstructions?: string, customer?: Customer | null, delivery?: { provider: string; address: string }, loyaltyRewardId?: string) => {
      await addOrder(tableNum, items, specialInstructions, customer, delivery, loyaltyRewardId);
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

  const managerActiveOrders = orders.filter((order) => ['pending', 'verified', 'preparing', 'ready'].includes(order.status)).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const managerTotalOrders = orders.filter((order) => isSameDay(order.createdAt, today)).length;
  // Served orders for TODAY only (matches the "Completed today" label on the dashboard card)
  const managerServedOrders = orders.filter(
    (order) =>
      order.status === 'served' &&
      (isSameDay(order.servedAt, today) || isSameDay(order.updatedAt, today) || isSameDay(order.createdAt, today))
  ).length;
  const managerTodaysRevenue = orders
    .filter(
      (order) =>
        order.status === 'served' &&
        (isSameDay(order.servedAt, today) || isSameDay(order.updatedAt, today) || isSameDay(order.createdAt, today))
    )
    .reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0);

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
      // Only served orders count as realised revenue; totals are in RWF (no /100 conversion needed)
      revenue: ordersInHour
        .filter((order) => order.status === 'served')
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
      setRestaurantName('');
      setTableNumber(null);
      setManagerPage('dashboard');
      setSupervisorPage('dashboard');
      setIsScanning(false);
      setDetectedTable(null);
      window.history.pushState({}, '', '/');
    }
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

    // Check for restaurant-specific table QR code path: /r/:restaurantId/t/:table
    const restaurantTableMatch = path.match(/^\/r\/([^/]+)\/t\/(\d+)/);
    if (restaurantTableMatch) {
      const parsedRestaurantId = decodeURIComponent(restaurantTableMatch[1]);
      const num = parseInt(restaurantTableMatch[2], 10);
      if (!isNaN(num)) {
        persistRestaurantContext(parsedRestaurantId);
        setSelectedRole('customer');
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

  // Update URL when role changes
  useEffect(() => {
    if (selectedRole && selectedRole !== 'customer') {
      window.history.replaceState({}, '', `/${selectedRole}`);
    }
  }, [selectedRole]);

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
      .then((restaurant: { name?: string }) => {
        if (!active) return;
        setRestaurantName(restaurant.name || '');
      })
      .catch((err: unknown) => {
        console.warn('Failed to fetch restaurant info:', err);
        if (active) setRestaurantName('');
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

  // Auth flow for staff roles - single login page
  if (!routeResolved) {
    return null;
  }

  if (!authUser && selectedRole !== 'customer') {
    return (
      <LoginPage
        onLogin={(user) => {
          setAuthUser(user);
          restoreStaffIdFromAuthUser(user);
          // Set selectedRole based on user's role
          if (user.role === 'superadmin') {
            setSelectedRole('superadmin');
          } else if (user.role === 'manager') {
            setSelectedRole('manager');
          } else if (user.role === 'supervisor') {
            setSelectedRole('supervisor');
          } else if (user.role === 'waiter') {
            setSelectedRole('waiter');
          } else if (user.role === 'kitchen') {
            setSelectedRole('kitchen');
          }
          // Save to localStorage and update state immediately
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
        }}
        onBack={() => {}} />); // No back needed for main login
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
              <span className="text-slate-100 font-medium">Supervisor Dashboard</span>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
            <div className="text-sm text-slate-400">{restaurantName || 'Company'}</div>
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
          </div>
        </div>

        {supervisorPage === 'dashboard' && (
          <SupervisorDashboard
            onManageMenu={() => setSupervisorPage('menu')}
            onLogout={handleBack}
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
        {supervisorPage === 'history' && <OrderHistoryPage onBack={() => setSupervisorPage('dashboard')} existingOrders={orders} />}
        {supervisorPage === 'expenses' && <SupervisorExpenseManagement />}
        {supervisorPage === 'menu' && <MenuManagement />}
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
              <ThemeToggle />
              <button
                onClick={handleBack}
                className="p-2 rounded-lg bg-slate-700/60 hover:bg-red-600 text-slate-200 hover:text-white transition-colors"
                aria-label="Logout"
              >
                <LogOutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Side Menu - responsive: horizontal scroll on mobile/tablet, vertical on desktop */}
          <aside className="w-full lg:w-56 lg:min-h-[calc(100vh-73px)] bg-slate-800 border-r border-slate-700 p-4">
            {/* Mobile/Tablet: horizontal scrollable menu */}
            <nav className="flex lg:flex-col overflow-x-auto gap-1 lg:space-y-1 pb-2 lg:pb-0">
              {(
                [
                  { id: 'dashboard', label: 'Dashboard' },
                  { id: 'inventory', label: 'Inventory' },
                  { id: 'menu', label: 'Manage Menu' },
                  { id: 'qrcodes', label: 'QR Codes' },
                  { id: 'history', label: 'Order History' },
                  { id: 'analytics', label: 'Analytics' },
                  { id: 'staff', label: 'Staff' },
                  { id: 'expenses', label: 'Expenses' },
                  { id: 'credit', label: 'Credit' },
                  { id: 'loyalty', label: 'Loyalty & SMS' },
                  { id: 'settings', label: 'Settings' },
                ] as Array<{ id: ManagerPage; label: string }>
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setManagerPage(item.id)}
                  className={`whitespace-nowrap px-4 py-2 text-left text-sm font-medium rounded-lg transition flex-shrink-0 ${
                    managerPage === item.id
                      ? 'bg-amber-500 text-slate-900'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
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
              />
            }
            {managerPage === 'menu' && <MenuManagement />}
            {managerPage === 'staff' && <StaffManagement onShowPerformance={() => setManagerPage('performance')} />}
            {managerPage === 'analytics' && <AnalyticsPage />}
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
            {managerPage === 'credit' && <CreditManagement />}
            {managerPage === 'loyalty' && <LoyaltyManagement />}
            {managerPage === 'history' && <OrderHistoryPage onBack={() => setManagerPage('dashboard')} existingOrders={orders} />}
            {managerPage === 'settings' && currentRestaurantId && (
              <RestaurantSettings
                restaurantId={currentRestaurantId}
                restaurantName={restaurantName}
                onNameChange={(newName) => setRestaurantName(newName)}
                onSettingsSaved={(s) => setReceiptSettings(s)}
              />
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
                <ThemeToggle />
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
                <ThemeToggle />
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
    <div className="min-h-screen bg-[#1a1410] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-2xl font-serif text-white font-bold">S</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-serif text-amber-500 tracking-tight">
              SERVV IQ
            </h1>
          </div>
          <p className="text-lg text-[#a89f91] max-w-sm mx-auto font-light">
            The Intelligence Layer of Servv
          </p>
        </motion.div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-br from-[#2a2018] to-[#1a1410] border border-[#3a2e20] p-8">
            <LoginPage
              onLogin={(user) => {
                setAuthUser(user);
                // Set selectedRole based on user's role
                if (user.role === 'superadmin') {
                  setSelectedRole('superadmin');
                } else if (user.role === 'manager') {
                  setSelectedRole('manager');
                } else if (user.role === 'supervisor') {
                  setSelectedRole('supervisor');
                } else if (user.role === 'waiter') {
                  setSelectedRole('waiter');
                } else if (user.role === 'kitchen') {
                  setSelectedRole('kitchen');
                }
                // Save to localStorage
                localStorage.setItem('authUser', JSON.stringify(user));
                localStorage.setItem('selectedRole', user.role);
                localStorage.setItem('staffId', user.id);
                localStorage.setItem('staffRole', user.role);
                if (user.restaurantId) {
                  localStorage.setItem('restaurantId', user.restaurantId);
                  setCurrentRestaurantId(user.restaurantId);
                }
              }}
              onBack={() => {}} />
          </Card>
        </motion.div>

        {/* Customer QR Scan Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 text-center"
        >
          <p className="text-[#a89f91] mb-4">
            Or scan QR code to order as a customer
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="px-6 py-2 rounded-full border-[#3a2e20] text-[#a89f91] hover:text-amber-500 hover:border-amber-500/50"
              onClick={() => handleScanQR()}
            >
              <QrCodeIcon className="w-4 h-4 mr-2" />
              Scan QR Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-6 py-2 rounded-full border-[#3a2e20] text-[#a89f91] hover:text-slate-100 hover:border-slate-500"
              onClick={handleGoSupplierPortal}
            >
              Supplier Portal
            </Button>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-[#a89f91]">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </motion.div>
      </div>
    </div>);

}