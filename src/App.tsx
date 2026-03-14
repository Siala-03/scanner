import React, { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, UtensilsIcon, BarChart3Icon, BriefcaseIcon, ChefHatIcon, QrCodeIcon, UsersIcon, TrendingUpIcon, ClockIcon, ShoppingBagIcon } from 'lucide-react';
import { CartItem, Order, OrderStatus } from './types';
import { mockStaff } from './data/staffData';
import { useOrders } from './hooks/useOrders';
import { useTables } from './hooks/useTables';
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
import { InventoryManagement } from './pages/shared/InventoryManagement';
import { KitchenDisplay } from './pages/kitchen/KitchenDisplay';
import { LoginPage } from './pages/auth/LoginPage';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Staff } from './types';
type UserRole = 'customer' | 'waiter' | 'supervisor' | 'manager' | 'kitchen' | null;
type ManagerPage = 'dashboard' | 'menu' | 'staff' | 'analytics' | 'qrcodes' | 'inventory' | 'history';
type SupervisorPage = 'dashboard' | 'revenue' | 'staff' | 'qrcodes' | 'inventory' | 'history';
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
  
  // Tables from backend
  const { tables, addTable } = useTables();

  const [waiterCalls, setWaiterCalls] = useState<
    {
      tableNumber: number;
      timestamp: Date;
    }[]>(
    []);
  const { orders, addOrder, updateOrderStatus } = useOrders();
  const handlePlaceOrder = useCallback(
    (tableNum: number, items: CartItem[], specialInstructions?: string) => {
      addOrder(tableNum, items, specialInstructions);
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
    setWaiterCalls((prev) => [
    ...prev,
    {
      tableNumber: tableNum,
      timestamp: new Date()
    }]
    );
  }, []);
  const handleDismissWaiterCall = useCallback((tableNum: number) => {
    setWaiterCalls((prev) =>
    prev.filter((call) => call.tableNumber !== tableNum)
    );
  }, []);
  const handleBack = () => {
    if (selectedRole === 'customer') {
      // Go to home page (root)
      window.history.pushState({}, '', '/');
    }
    if (selectedRole === 'manager' && managerPage !== 'dashboard') {
      setManagerPage('dashboard');
    } else if (
    selectedRole === 'supervisor' &&
    supervisorPage !== 'dashboard')
    {
      setSupervisorPage('dashboard');
    } else {
      setSelectedRole(null);
      setAuthUser(null);
      setTableNumber(null);
      setManagerPage('dashboard');
      setSupervisorPage('dashboard');
      setShowQRGrid(false);
      setDetectedTable(null);
      setScanningTable(null);
      setIsScanning(false);
      // Reset URL to home
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
    
    // Check for table QR code: /t/123
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
    }
  }, []);

  // Update URL when role changes
  useEffect(() => {
    if (selectedRole && selectedRole !== 'customer') {
      window.history.replaceState({}, '', `/${selectedRole}`);
    }
  }, [selectedRole]);

  // Auth flow for staff roles
  if (selectedRole && selectedRole !== 'customer' && !authUser) {
    return (
      <LoginPage
        role={selectedRole}
        onLogin={setAuthUser}
        onBack={handleBack} />);


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
          onDismissWaiterCall={handleDismissWaiterCall} />
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
          </div>
        </div>

        {supervisorPage === 'dashboard' && (
          <SupervisorDashboard
            orders={orders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
          />
        )}
        {supervisorPage === 'revenue' && <RevenueReports />}
        {supervisorPage === 'staff' && <StaffPerformance />}
        {supervisorPage === 'qrcodes' && (
          <QRCodeGenerator
            tables={tables}
            onAddTable={() => {
              const next = tables.length > 0 ? Math.max(...tables) + 1 : 1;
              addTable(next);
            }}
          />
        )}
        {supervisorPage === 'inventory' && <InventoryManagement role="supervisor" />}
        {supervisorPage === 'history' && <OrderHistoryPage onBack={() => setSupervisorPage('dashboard')} existingOrders={orders} />}
      </div>
    );
  }
  // Manager portal
  if (selectedRole === 'manager' && authUser) {
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
            <span className="text-white font-medium">Manager Dashboard</span>
          </div>
        </div>

        {managerPage === 'dashboard' &&
        <ManagerDashboard
          onNavigate={(page) => setManagerPage(page as ManagerPage)} />

        }
        {managerPage === 'menu' && <MenuManagement />}
        {managerPage === 'staff' && <StaffManagement />}
        {managerPage === 'analytics' && <AnalyticsPage />}
        {managerPage === 'inventory' && <InventoryManagement role="manager" />}
        {managerPage === 'qrcodes' && (
          <QRCodeGenerator
            tables={tables}
            onAddTable={() => {
              const next = tables.length > 0 ? Math.max(...tables) + 1 : 1;
              addTable(next);
            }}
          />
        )}
        {managerPage === 'history' && <OrderHistoryPage onBack={() => setManagerPage('dashboard')} existingOrders={orders} />}
      </div>);

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
        <KitchenDisplay />
      </div>
    );
  }

  // Role selection (landing page)
  return (
    <div className="min-h-screen bg-[#1a1410] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{
            opacity: 0,
            y: -20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          className="text-center mb-12">

          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-2xl font-serif text-white font-bold">S</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif text-amber-500 tracking-tight">
              SERVV
            </h1>
          </div>
          <p className="text-lg text-[#a89f91] max-w-2xl mx-auto font-light">
            A complete end-to-end solution for modern hospitality.
          </p>
        </motion.div>

        {/* Customer QR Scan Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-[#2a2018] to-[#1a1410] rounded-2xl border border-[#3a2e20] p-8 mb-12"
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <ShoppingBagIcon className="w-4 h-4 text-green-400" />
                </div>
                <span className="text-xs font-medium text-green-400/60 uppercase tracking-wider">Customer</span>
              </div>
              <h2 className="text-2xl font-semibold text-[#e8e4dc] mb-3">
                Scan QR to Order
              </h2>
              <p className="text-[#a89f91] mb-6">
                Customers can scan the QR code on their table to access the digital menu and place orders directly from their phones.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="px-8 py-3 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.15)] hover:shadow-[0_0_40px_rgba(245,158,11,0.3)]"
                  onClick={() => handleScanQR()}
                >
                  <QrCodeIcon className="w-5 h-5 mr-2" />
                  Scan QR Code
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="px-8 py-3 rounded-full border-[#3a2e20] text-[#a89f91] hover:text-amber-500 hover:border-amber-500/50"
                  onClick={() => setShowQRGrid(true)}
                >
                  Demo: Pick Table
                </Button>
              </div>
            </div>
            <div className="w-48 h-48 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent rounded-2xl" />
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="grid grid-cols-5 gap-2 opacity-40">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-sm ${[0, 2, 3, 5, 6, 8, 10, 12, 14, 15, 17, 18, 20, 22, 23, 24].includes(i) ? 'bg-amber-500' : 'bg-transparent'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Scanning / Detection Overlay */}
        <AnimatePresence>
            {(isScanning || detectedTable) &&
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.9
              }}
              animate={{
                opacity: 1,
                scale: 1
              }}
              exit={{
                opacity: 0,
                scale: 0.9
              }}
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">

                <div className="text-center">
                  {isScanning &&
                <motion.div className="relative w-56 h-56 mx-auto mb-6">
                      {/* QR frame corners */}
                      <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />

                      {/* Scanning line */}
                      <motion.div
                    animate={{
                      y: [0, 200, 0]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 2,
                      ease: 'easeInOut'
                    }}
                    className="absolute left-2 right-2 h-0.5 bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]" />


                      {/* Simulated QR pattern */}
                      <div className="absolute inset-8 flex items-center justify-center">
                        <div className="grid grid-cols-5 gap-1.5 opacity-30">
                          {Array.from({
                        length: 25
                      }).map((_, i) =>
                      <div
                        key={i}
                        className={`w-5 h-5 rounded-sm ${Math.random() > 0.4 ? 'bg-white' : 'bg-transparent'}`} />

                      )}
                        </div>
                      </div>

                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-amber-500/60 text-4xl font-bold">
                          {scanningTable}
                        </span>
                      </div>
                    </motion.div>
                }

                  {isScanning &&
                <p className="text-[#a89f91] text-lg animate-pulse">
                      Scanning QR code...
                    </p>
                }

                  {detectedTable && !isScanning &&
                <motion.div
                  initial={{
                    scale: 0.5,
                    opacity: 0
                  }}
                  animate={{
                    scale: 1,
                    opacity: 1
                  }}
                  transition={{
                    type: 'spring',
                    damping: 15
                  }}>

                      <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto mb-4">
                        <svg
                      className="w-12 h-12 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}>

                          <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7" />

                        </svg>
                      </div>
                      <p className="text-white text-2xl font-semibold mb-1">
                        Table {detectedTable}
                      </p>
                      <p className="text-green-400 text-lg">
                        QR code detected! Opening menu...
                      </p>
                    </motion.div>
                }
                </div>
              </motion.div>
            }
          </AnimatePresence>

        {/* Staff Role Cards */}
        <div className="mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl md:text-3xl font-medium text-[#e8e4dc] mb-3">
              Staff Portals
            </h2>
            <p className="text-[#a89f91] max-w-xl mx-auto">
              Access your dedicated workspace based on your role
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Waiter Portal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card
                variant="interactive"
                className="bg-gradient-to-br from-[#1e3a5f] to-[#0f172a] border border-blue-500/20 h-full p-6 group cursor-pointer"
                onClick={() => setSelectedRole('waiter')}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                    <UtensilsIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-blue-400/60 uppercase tracking-wider">
                    Service
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Waiter
                </h3>
                <p className="text-blue-200/70 text-sm mb-4">
                  Manage tables, approve orders, and track preparation status.
                </p>
                <div className="flex items-center gap-4 text-xs text-blue-300/60">
                  <div className="flex items-center gap-1">
                    <ShoppingBagIcon className="w-3.5 h-3.5" />
                    <span>Orders</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ClockIcon className="w-3.5 h-3.5" />
                    <span>Real-time</span>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Supervisor Portal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card
                variant="interactive"
                className="bg-gradient-to-br from-[#3d1d5a] to-[#1a0a2e] border border-purple-500/20 h-full p-6 group cursor-pointer"
                onClick={() => setSelectedRole('supervisor')}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                    <BarChart3Icon className="w-6 h-6 text-purple-400" />
                  </div>
                  <span className="text-xs font-medium text-purple-400/60 uppercase tracking-wider">
                    Analytics
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Supervisor
                </h3>
                <p className="text-purple-200/70 text-sm mb-4">
                  Monitor operations, track revenue, and oversee staff performance.
                </p>
                <div className="flex items-center gap-4 text-xs text-purple-300/60">
                  <div className="flex items-center gap-1">
                    <TrendingUpIcon className="w-3.5 h-3.5" />
                    <span>Revenue</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <UsersIcon className="w-3.5 h-3.5" />
                    <span>Staff</span>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Manager Portal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card
                variant="interactive"
                className="bg-gradient-to-br from-[#1d4d3a] to-[#0a1f17] border border-emerald-500/20 h-full p-6 group cursor-pointer"
                onClick={() => setSelectedRole('manager')}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                    <BriefcaseIcon className="w-6 h-6 text-emerald-400" />
                  </div>
                  <span className="text-xs font-medium text-emerald-400/60 uppercase tracking-wider">
                    Admin
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Manager
                </h3>
                <p className="text-emerald-200/70 text-sm mb-4">
                  Full control: menu, staff, analytics, and system settings.
                </p>
                <div className="flex items-center gap-4 text-xs text-emerald-300/60">
                  <div className="flex items-center gap-1">
                    <UsersIcon className="w-3.5 h-3.5" />
                    <span>Staff</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <BarChart3Icon className="w-3.5 h-3.5" />
                    <span>Analytics</span>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Kitchen Portal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Card
                variant="interactive"
                className="bg-gradient-to-br from-[#5d2a2a] to-[#1f0f0f] border border-orange-500/20 h-full p-6 group cursor-pointer"
                onClick={() => setSelectedRole('kitchen')}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/30 transition-colors">
                    <ChefHatIcon className="w-6 h-6 text-orange-400" />
                  </div>
                  <span className="text-xs font-medium text-orange-400/60 uppercase tracking-wider">
                    Kitchen
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Kitchen
                </h3>
                <p className="text-orange-200/70 text-sm mb-4">
                  Real-time order display system for efficient food preparation.
                </p>
                <div className="flex items-center gap-4 text-xs text-orange-300/60">
                  <div className="flex items-center gap-1">
                    <ClockIcon className="w-3.5 h-3.5" />
                    <span>Live Orders</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <UtensilsIcon className="w-3.5 h-3.5" />
                    <span>KDS</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>);

}