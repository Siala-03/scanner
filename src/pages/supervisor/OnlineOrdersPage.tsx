import { useOrdersContext } from '../../contexts/OrdersContext';
import { OnlineOrdersPanel } from '../../components/supervisor/OnlineOrdersPanel';

export function OnlineOrdersPage() {
  const { orders, updateOrderStatus } = useOrdersContext();

  const isOnline = (o: any) =>
    o.isOnlineOrder === true || o.is_online_order === true ||
    o.tableNumber === 999 || o.table_number === 999;

  const pendingCount = orders.filter((o) => isOnline(o) && o.status === 'pending').length;

  return (
    <div className="supervisor-surface min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-4 md:p-8 transition-colors">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 rounded-2xl border border-slate-700/70 bg-slate-900/60 px-5 py-4 shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌐</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Online Orders</h1>
              <p className="text-slate-400 text-sm">Manage and approve incoming online orders</p>
            </div>
            {pendingCount > 0 && (
              <span className="ml-auto px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-sm font-semibold">
                {pendingCount} awaiting approval
              </span>
            )}
          </div>
        </div>

        <OnlineOrdersPanel
          orders={orders}
          onStatusChange={(orderId, newStatus) =>
            updateOrderStatus(orderId, newStatus as 'verified' | 'preparing' | 'ready' | 'served' | 'cancelled')
          }
        />
      </div>
    </div>
  );
}
