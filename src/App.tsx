import React, { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, UtensilsIcon, BarChart3Icon, BriefcaseIcon, ChefHatIcon, QrCodeIcon, UsersIcon, TrendingUpIcon, ClockIcon, ShoppingBagIcon, TruckIcon } from 'lucide-react';
import { CartItem, Order, OrderStatus, Customer } from './types';
import { useStaff } from './hooks/useStaff';
import { useOrders } from './hooks/useOrders';
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
import ExpenseApproval from './components/manager/ExpenseApproval';
import SupervisorExpenseManagement from './components/supervisor/ExpenseManagement';
import { InventoryManagement } from './pages/shared/InventoryManagement';
import { SimpleInventory } from './pages/shared/SimpleInventory';
import { KitchenDisplay } from './pages/kitchen/KitchenDisplay';
import { LoginPage } from './pages/auth/LoginPage';
import { SuperAdminDashboard } from './pages/superadmin/SuperAdminDashboard';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Staff } from './types';
type UserRole = 'customer' | 'waiter' | 'supervisor' | 'manager' | 'kitchen' | 'superadmin' | null;
type ManagerPage = 'dashboard' | 'menu' | 'staff' | 'analytics' | 'performance' | 'qrcodes' | 'inventory' | 'history' | 'expenses';
type SupervisorPage = 'dashboard' | 'revenue' | 'staff' | 'qrcodes' | 'inventory' | 'menu' | 'history' | 'expenses';
export function App() {
  const [selectedRole, setSelectedRole] = useState<UserRole>(null);
  const [authUser, setAuthUser] = useState<Staff | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [managerPage, setManagerPage] = useState<ManagerPage>('dashboard');
  const [supervisorPage, setSupervisorPage] =
  useState<SupervisorPage>('dashboard');
  const [isScanning, setIsScanning] = useState(false);
  const [scanningTable, setScanningTable] = useState<number | null>(null);
  const [detectedTable, setDetectedTable] = useState<number | null>(null);
  const [showQRGrid, setShowQRGrid] = useState(false);
  const { tables, isLoading: isTablesLoading, addTable, removeTable, refetch: reloadTables } = useTables();

  const [waiterCalls, setWaiterCalls] = useState<
    {
      tableNumber: number;
      timestamp: Date;
    }[]>(
    []);
  const { orders, addOrder, updateOrderStatus } = useOrders();
  const handlePlaceOrder = useCallback(
    (tableNum: number, items: CartItem[], specialInstructions?: string, customer?: Customer | null, delivery?: { provider: string; address: string }, loyaltyRewardId?: string) => {
      addOrder(tableNum, items, specialInstructions, customer, delivery, loyaltyRewardId);
    },
    [addOrder]
  );
  const handleUpdateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, opts?: { assignedWaiterId?: string }) => {
      updateOrderStatus(orderId, status, opts);
    },
    [updateOrderStatus]
  );
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
  const handleDismissWaiterCall = useCallback((tableNum: number) => {
    setWaiterCalls((prev) =>
    prev.filter((call) => call.tableNumber !== tableNum)
    );
  }, []);

  const managerTotalOrders = orders.length;
  const managerActiveOrders = orders.filter((order) => ['pending', 'verified', 'preparing', 'ready'].includes(order.status)).length;
  const managerServedOrders = orders.filter((order) => order.status === 'served').length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const managerTodaysRevenue = orders
    .filter((order) => new Date(order.createdAt) >= today && order.status === 'served')
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
      revenue: ordersInHour.reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0) / 100
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
      // Clear auth when leaving staff portal
      logoutStaff();
      setSelectedRole(null);
      setAuthUser(null);
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

    // Check for query table: ?table=123
    const queryTable = query.get('table');
    if (queryTable) {
      const num = parseInt(queryTable, 10);
      if (!isNaN(num)) {
        setSelectedRole('customer');
        setTableNumber(num);
        return;
      }
    }

    // Check for table QR code path: /t/123
    const tableMatch = path.match(/^\/t\/(\d+)/);
    if (tableMatch) {
      const num = parseInt(tableMatch[1], 10);
      if (!isNaN(num)) {
        setSelectedRole('customer');
        setTableNumber(num);
        return;
      }
    }

    // Check for role-based URLs
    if (path === '/waiter' || path.startsWith('/waiter')) {
      setSelectedRole('waiter');
    } else if (path === '/kitchen' || path.startsWith('/kitchen')) {
      setSelectedRole('kitchen');
    } else if (path === '/manager' || path.startsWith('/manager')) {
      setSelectedRole('manager');
    } else if (path === '/supervisor' || path.startsWith('/supervisor')) {
      setSelectedRole('supervisor');
    } else if (path === '/' || path.startsWith('/t/') || queryTable) {

      // Unknown path fallback: keep app loadable and show friendly message
      window.history.replaceState({}, '', '/');
      setSelectedRole(null);
    }
  }, []);

  // Update URL when role changes
  useEffect(() => {
    if (selectedRole && selectedRole !== 'customer') {
      window.history.replaceState({}, '', `/${selectedRole}`);
    }
  }, [selectedRole]);

  // Auth flow for staff roles - single login page
  if (!authUser && selectedRole !== 'customer') {
    return (
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
          onPlaceOrder={handlePlaceOrder}
          onCallWaiter={() => handleCallWaiter(tableNumber)} />

      </div>);

  }
  // Waiter portal
  if (selectedRole === 'waiter' && authUser) {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Fixed Header with Back Button */}
        <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-white font-medium">Waiter Dashboard</span>
          </div>
        </div>
        <WaiterDashboard
          waiter={authUser}
          orders={orders}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          waiterCalls={waiterCalls}
          onDismissWaiterCall={handleDismissWaiterCall}
          onLogout={handleBack} />
      </div>);

  }
  // Supervisor portal
  if (selectedRole === 'supervisor' && authUser) {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Fixed Header with Back Button */}
        <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-white font-medium">Supervisor Dashboard</span>
          </div>
        </div>

        <div className="dark bg-slate-900 px-4 pb-4">
          <div className="max-w-7xl mx-auto flex gap-2 py-4">
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
        {supervisorPage === 'staff' && <StaffPerformance />}
        {supervisorPage === 'qrcodes' && (
          <QRCodeGenerator
            tables={tables}
            onAddTable={() => {
              const next = tables.length > 0 ? Math.max(...tables) + 1 : 1;
              addTable(next).catch((err) => console.error('Failed to add table:', err));
            }}
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
          <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-600 text-slate-200"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <div className="text-sm text-slate-300 uppercase tracking-wider">Manager Portal</div>
              <div className="text-lg font-semibold">Welcome, {authUser.name}</div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'inventory', label: 'Inventory' },
              { id: 'menu', label: 'Manage Menu' },
              { id: 'history', label: 'Order History' },
              { id: 'analytics', label: 'Analytics' },
              { id: 'staff', label: 'Staff' },
              { id: 'performance', label: 'Performance' },
            {
              id: 'expenses',
              label: 'Expenses'
            },
          ].map((item) => (
              <button
                key={item.id}
                onClick={() => setManagerPage(item.id as ManagerPage)}
                className={`px-3 py-2 rounded-full text-xs font-semibold transition ${managerPage === item.id ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <main className="bg-slate-900 text-slate-100 rounded-none p-0 min-h-[70vh] min-w-0 overflow-x-auto">
            {managerPage === 'dashboard' &&
              <ManagerDashboard
                onNavigate={(page) => setManagerPage(page as ManagerPage)}
                onLogout={handleBack}
                totalOrders={managerTotalOrders}
                activeOrders={managerActiveOrders}
                servedOrders={managerServedOrders}
                todaysRevenue={managerTodaysRevenue}
                tableCount={tables.length}
                ordersByHour={ordersByHour}
                statusBreakdown={statusBreakdown}
              />
            }
            {managerPage === 'menu' && <MenuManagement />}
            {managerPage === 'staff' && <StaffManagement />}
            {managerPage === 'analytics' && <AnalyticsPage />}
            {managerPage === 'performance' && <StaffPerformance />}
            {managerPage === 'inventory' && <InventoryManagement role="manager" />}
            {managerPage === 'qrcodes' && (
              <QRCodeGenerator
                tables={tables}
                onAddTable={() => {
                  const next = tables.length > 0 ? Math.max(...tables) + 1 : 1;
                  addTable(next).catch((err) => console.error('Failed to add table:', err));
                }}
              />
            )}
            {managerPage === 'expenses' && <ExpenseApproval />}
            {managerPage === 'history' && <OrderHistoryPage onBack={() => setManagerPage('dashboard')} existingOrders={orders} />}
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
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-white font-medium">Kitchen Display</span>
          </div>
        </div>
        <KitchenDisplay onLogout={handleBack} />
      </div>
    );
  }

  // Superadmin portal (requires auth)
  if (selectedRole === 'superadmin' && authUser) {
    return (
      <div className="min-h-screen bg-slate-900">
        {/* Fixed Header with Back Button */}
        <div className="sticky top-0 z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-white font-medium">Superadmin Dashboard</span>
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
              SERVV
            </h1>
          </div>
          <p className="text-lg text-[#a89f91] max-w-sm mx-auto font-light">
            Restaurant Management System
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
          <Button
            variant="secondary"
            size="sm"
            className="px-6 py-2 rounded-full border-[#3a2e20] text-[#a89f91] hover:text-amber-500 hover:border-amber-500/50"
            onClick={() => handleScanQR()}
          >
            <QrCodeIcon className="w-4 h-4 mr-2" />
            Scan QR Code
          </Button>
        </motion.div>
      </div>
    </div>);

}