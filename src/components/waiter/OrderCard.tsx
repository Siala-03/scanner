import React from 'react';
import { motion } from 'framer-motion';
import { ClockIcon, MapPinIcon, UtensilsIcon, WineIcon } from 'lucide-react';
import { Order } from '../../types';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatPrice } from '../../utils/currency';
interface OrderCardProps {
  order: Order;
  onViewDetails: (order: Order) => void;
  onApprove?: (orderId: string) => void;
  onReject?: (orderId: string) => void;
  onMarkReady?: (orderId: string) => void;
  onMarkServed?: (orderId: string) => void;
}
export function OrderCard({
  order,
  onViewDetails,
  onApprove,
  onReject,
  onMarkReady,
  onMarkServed
}: OrderCardProps) {
  const minutesAgo = Math.floor(
    (Date.now() - order.createdAt.getTime()) / 60000
  );
  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        y: 20
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      exit={{
        opacity: 0,
        x: -100
      }}
      className="bg-slate-800 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-colors"
      onClick={() => onViewDetails(order)}>

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <MapPinIcon className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">
                Table {order.tableNumber}
              </span>
              {order.requiresKitchen &&
              <UtensilsIcon
                className="w-4 h-4 text-orange-400"
                title="Requires kitchen" />

              }
              {!order.requiresKitchen &&
              <WineIcon
                className="w-4 h-4 text-purple-400"
                title="Bar only" />

              }
            </div>
            <p className="text-sm text-slate-400">{order.id}</p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="space-y-1 mb-3">
        {order.items.slice(0, 3).map((item, index) =>
        <div key={index} className="flex justify-between text-sm">
            <span className="text-slate-300">
              {item.quantity}x {item.menuItem.name}
            </span>
          </div>
        )}
        {order.items.length > 3 &&
        <p className="text-sm text-slate-500">
            +{order.items.length - 3} more items
          </p>
        }
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ClockIcon className="w-4 h-4" />
            <span className="text-sm">{minutesAgo}m ago</span>
          </div>
          <span className="text-lg font-bold text-amber-400">
            {formatPrice(order.total)}
          </span>
        </div>

        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {order.status === 'pending' && onApprove && onReject &&
          <>
              <Button
              variant="danger"
              size="sm"
              onClick={() => onReject(order.id)}>

                Reject
              </Button>
              <Button
              variant="primary"
              size="sm"
              onClick={() => onApprove(order.id)}>

                Approve
              </Button>
            </>
          }
          {order.status === 'preparing' && onMarkReady &&
          <Button
            variant="primary"
            size="sm"
            onClick={() => onMarkReady(order.id)}>

              Mark Ready
            </Button>
          }
          {order.status === 'ready' && onMarkServed &&
          <Button
            variant="primary"
            size="sm"
            onClick={() => onMarkServed(order.id)}>

              Mark Served
            </Button>
          }
        </div>
      </div>
    </motion.div>);

}