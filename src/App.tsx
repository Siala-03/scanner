import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon } from 'lucide-react';
import { CartItem, Order, OrderStatus } from './types';
import { mockStaff } from './data/staffData';
import { useOrders } from './hooks/useOrders';
import { CustomerApp } from './pages/customer/CustomerApp';
import { WaiterDashboard } from './pages/waiter/WaiterDashboard';
import { SupervisorDashboard } from './pages/supervisor/SupervisorDashboard';
import { RevenueReports } from './pages/supervisor/RevenueReports';
import { StaffPerformance } from './pages/supervisor/StaffPerformance';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { MenuManagement } from './pages/manager/MenuManagement';
import { StaffManagement } from './pages/manager/StaffManagement';
import { AnalyticsPage } from './pages/manager/AnalyticsPage';
import { QRCodeGenerator } from './pages/manager/QRCodeGenerator';
import { LoginPage } from './pages/auth/LoginPage';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Staff } from './types';
type UserRole = 'customer' | 'waiter' | 'supervisor' | 'manager' | null;
type ManagerPage = 'dashboard' | 'menu' | 'staff' | 'analytics' | 'qrcodes';
type SupervisorPage = 'dashboard' | 'revenue' | 'staff';
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
    (orderId: string, status: OrderStatus) => {
      updateOrderStatus(orderId, status);
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
    }
  };
  const handleScanQR = (tableNum?: number) => {
    const targetTable = tableNum || Math.floor(Math.random() * 20) + 1;
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
        setDetectedTable(null);
        setScanningTable(null);
        setShowQRGrid(false);
      }, 1200);
    }, 1500);
  };
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
          className="fixed top-4 left-4 z-50 p-2 rounded-full bg-white shadow-md text-slate-600">

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
      <div className="relative">
        <button
          onClick={handleBack}
          className="fixed top-4 left-4 z-50 p-2 rounded-full bg-slate-800 text-white shadow-md">

          <ArrowLeftIcon className="w-5 h-5" />
        </button>
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
      <div className="relative">
        <button
          onClick={handleBack}
          className="fixed top-4 left-4 z-50 p-2 rounded-full bg-slate-800 text-white shadow-md">

          <ArrowLeftIcon className="w-5 h-5" />
        </button>

        {supervisorPage === 'dashboard' &&
        <div>
            <div className="dark bg-slate-900 px-4 pt-16 pb-4">
              <div className="max-w-7xl mx-auto flex gap-2">
                <Button
                variant={supervisorPage === 'dashboard' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setSupervisorPage('dashboard')}>

                  Dashboard
                </Button>
                <Button
                variant="ghost"
                size="sm"
                onClick={() => setSupervisorPage('revenue')}>

                  Revenue
                </Button>
                <Button
                variant="ghost"
                size="sm"
                onClick={() => setSupervisorPage('staff')}>

                  Staff
                </Button>
              </div>
            </div>
            <SupervisorDashboard
            orders={orders}
            onUpdateOrderStatus={handleUpdateOrderStatus} />

          </div>
        }
        {supervisorPage === 'revenue' && <RevenueReports />}
        {supervisorPage === 'staff' && <StaffPerformance />}
      </div>);

  }
  // Manager portal
  if (selectedRole === 'manager' && authUser) {
    return (
      <div className="relative">
        <button
          onClick={handleBack}
          className="fixed top-4 left-4 z-50 p-2 rounded-full bg-slate-800 text-white shadow-md">

          <ArrowLeftIcon className="w-5 h-5" />
        </button>

        {managerPage === 'dashboard' &&
        <ManagerDashboard
          onNavigate={(page) => setManagerPage(page as ManagerPage)} />

        }
        {managerPage === 'menu' && <MenuManagement />}
        {managerPage === 'staff' && <StaffManagement />}
        {managerPage === 'analytics' && <AnalyticsPage />}
        {managerPage === 'qrcodes' && <QRCodeGenerator />}
      </div>);

  }
  // Role selection (landing page)
  return (
    <div className="min-h-screen bg-[#1a1410] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
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
          className="text-center mb-16">

          <h1 className="text-4xl md:text-6xl font-serif text-amber-500 mb-4 tracking-tight">
            SERV
          </h1>
          <p className="text-lg text-[#a89f91] max-w-2xl mx-auto font-light">
            A complete end-to-end solution for modern hospitality.
          </p>
        </motion.div>

        {/* QR Scan Section */}
        <div className="flex flex-col items-center mb-16">
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

          {!showQRGrid ?
          <div className="flex flex-col items-center gap-4">
              <motion.div
              whileTap={{
                scale: 0.95
              }}>

                <Button
                variant="primary"
                size="lg"
                className="px-12 py-4 text-lg rounded-full shadow-[0_0_40px_rgba(245,158,11,0.2)] hover:shadow-[0_0_60px_rgba(245,158,11,0.4)]"
                onClick={() => handleScanQR()}>

                  Scan QR Code to Order
                </Button>
              </motion.div>
              <button
              onClick={() => setShowQRGrid(true)}
              className="text-[#a89f91] text-sm hover:text-amber-500 transition-colors underline underline-offset-4">

                Demo: Pick a table QR to scan
              </button>
            </div> :

          <motion.div
            initial={{
              opacity: 0,
              y: 10
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            className="w-full max-w-lg">

              <div className="text-center mb-6">
                <p className="text-[#e8e4dc] text-lg font-medium mb-1">
                  Select a table's QR code
                </p>
                <p className="text-[#a89f91] text-sm">
                  Each table has a unique QR code linked to its number
                </p>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {Array.from(
                {
                  length: 20
                },
                (_, i) => i + 1
              ).map((num) =>
              <motion.button
                key={num}
                whileHover={{
                  scale: 1.05
                }}
                whileTap={{
                  scale: 0.95
                }}
                onClick={() => handleScanQR(num)}
                disabled={isScanning || !!detectedTable}
                className="aspect-square rounded-xl bg-[#2a2018] border border-[#3a2e20] flex flex-col items-center justify-center gap-1.5 hover:border-amber-500/50 hover:bg-[#332818] transition-colors disabled:opacity-50">

                    {/* Mini QR pattern */}
                    <div className="grid grid-cols-3 gap-0.5">
                      {Array.from({
                    length: 9
                  }).map((_, i) =>
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-[1px] ${[0, 2, 3, 5, 6, 8].includes(i) ? 'bg-amber-500/40' : 'bg-transparent'}`} />

                  )}
                    </div>
                    <span className="text-[#e8e4dc] text-sm font-semibold">
                      T{num}
                    </span>
                  </motion.button>
              )}
              </div>
              <div className="text-center mt-4">
                <button
                onClick={() => setShowQRGrid(false)}
                className="text-[#a89f91] text-sm hover:text-amber-500 transition-colors">

                  ← Back
                </button>
              </div>
            </motion.div>
          }
        </div>

        {/* Staff Role Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: 0.2
            }}>

            <Card
              variant="interactive"
              className="bg-[#2a2018] border border-[#3a2e20] h-full p-8 group"
              onClick={() => setSelectedRole('waiter')}>

              <div className="text-4xl font-serif text-amber-500/30 group-hover:text-amber-500/50 transition-colors mb-6">
                01
              </div>
              <h2 className="text-2xl font-medium text-[#e8e4dc] mb-3">
                Waiter
              </h2>
              <p className="text-[#a89f91] font-light leading-relaxed">
                Manage assigned tables, approve incoming orders, and track
                preparation status.
              </p>
            </Card>
          </motion.div>

          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: 0.3
            }}>

            <Card
              variant="interactive"
              className="bg-[#2a2018] border border-[#3a2e20] h-full p-8 group"
              onClick={() => setSelectedRole('supervisor')}>

              <div className="text-4xl font-serif text-amber-500/30 group-hover:text-amber-500/50 transition-colors mb-6">
                02
              </div>
              <h2 className="text-2xl font-medium text-[#e8e4dc] mb-3">
                Supervisor
              </h2>
              <p className="text-[#a89f91] font-light leading-relaxed">
                Monitor live operations, track daily revenue, and oversee staff
                performance.
              </p>
            </Card>
          </motion.div>

          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: 0.4
            }}>

            <Card
              variant="interactive"
              className="bg-[#2a2018] border border-[#3a2e20] h-full p-8 group"
              onClick={() => setSelectedRole('manager')}>

              <div className="text-4xl font-serif text-amber-500/30 group-hover:text-amber-500/50 transition-colors mb-6">
                03
              </div>
              <h2 className="text-2xl font-medium text-[#e8e4dc] mb-3">
                Manager
              </h2>
              <p className="text-[#a89f91] font-light leading-relaxed">
                Full system control: manage menu items, assign staff tables, and
                view deep analytics.
              </p>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>);

}