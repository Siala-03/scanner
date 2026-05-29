import React from 'react';
import {
  ClockIcon,
  MapPinIcon,
  UtensilsIcon,
  WineIcon,
  MessageSquareIcon,
  XCircleIcon,
  UserIcon,
  CheckCircleIcon,
} from 'lucide-react';
import { Order } from '../../types';
import { Modal } from '../ui/Modal';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';

export interface CancellationDetails {
  reason: string | null;
  requestedByName: string | null;
  requestedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (order: Order) => void;
  onReject?: (orderId: string) => void;
  onCancel?: (orderId: string) => void;
  onMarkReady?: (orderId: string) => void;
  onMarkServed?: (orderId: string) => void;
  onPrintReceipt?: (order: Order) => void;
  cancellationDetails?: CancellationDetails | null;
}
export function OrderDetailModal({
  order,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onCancel,
  onMarkReady,
  onMarkServed,
  onPrintReceipt,
  cancellationDetails,
}: OrderDetailModalProps) {
  if (!order) return null;
  const minutesAgo = Math.floor(
    (Date.now() - new Date(order.createdAt).getTime()) / 60000
  );
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order ${order.id}`}
      size="lg">

      <div className="space-y-6">
        {/* Header info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <MapPinIcon className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                Table {order.tableNumber}
              </h3>
              <div className="flex items-center gap-2 text-slate-400">
                <ClockIcon className="w-4 h-4" />
                <span>{minutesAgo} minutes ago</span>
              </div>
            </div>
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* ── Cancellation details (cancelled orders only) ─────────────── */}
        {order.status === 'cancelled' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
              <XCircleIcon className="w-4 h-4 shrink-0" />
              Order Voided
            </div>

            {/* Reason */}
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Reason</p>
              <p className="text-sm text-slate-200">
                {cancellationDetails?.reason || (order as any).cancel_reason || (order as any).cancelReason || (order as any).notes || (
                  <span className="italic text-slate-500">No reason recorded</span>
                )}
              </p>
            </div>

            {/* Requested by */}
            {cancellationDetails?.requestedByName && (
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-0.5 flex items-center gap-1">
                    <UserIcon className="w-3 h-3" /> Requested by
                  </p>
                  <p className="text-sm text-slate-200">{cancellationDetails.requestedByName}</p>
                  {cancellationDetails.requestedAt && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(cancellationDetails.requestedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Approved by */}
                {cancellationDetails.approvedByName && (
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-0.5 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" /> Approved by
                    </p>
                    <p className="text-sm text-slate-200">{cancellationDetails.approvedByName}</p>
                    {cancellationDetails.approvedAt && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(cancellationDetails.approvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Order type indicator */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-700/50">
          {order.requiresKitchen ?
          <>
              <UtensilsIcon className="w-5 h-5 text-orange-400" />
              <span className="text-slate-300">
                This order includes food items (sent to kitchen)
              </span>
            </> :

          <>
              <WineIcon className="w-5 h-5 text-purple-400" />
              <span className="text-slate-300">Bar order only (drinks)</span>
            </>
          }
        </div>

        {/* Items list */}
        <div>
          <h4 className="font-semibold text-white mb-3">Order Items</h4>
          <div className="space-y-3">
            {order.items.map((item, index) =>
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50">

                <div className="flex items-center gap-3">
                  <span className="text-2xl">{item.menuItem?.emoji ?? '🍽'}</span>
                  <div>
                    <p className="font-medium text-white">
                      {item.menuItem?.name ?? item.menuItemName ?? 'Unknown item'}
                    </p>
                    <p className="text-sm text-slate-400">
                      {formatPrice(item.unitPrice ?? getEffectivePrice(item.menuItem))} × {item.quantity}
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-amber-400">
                  {formatPrice((item.unitPrice ?? getEffectivePrice(item.menuItem)) * item.quantity)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Special instructions */}
        {order.specialInstructions &&
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquareIcon className="w-5 h-5 text-yellow-400" />
              <span className="font-medium text-yellow-400">
                Special Instructions
              </span>
            </div>
            <p className="text-slate-300">{order.specialInstructions}</p>
          </div>
        }

        {/* Order summary */}
        <div className="p-4 rounded-lg bg-slate-700/50">
          <div className="space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-white pt-2 border-t border-slate-600">
              <span>Total</span>
              <span className="text-amber-400">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Print receipt (redirect to POS) */}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              if (onPrintReceipt) {
                onPrintReceipt(order);
              } else {
                try {
                  window.print();
                } catch {
                  console.warn('Unable to print');
                }
              }
            }}>
            Print Receipt
          </Button>
        </div>

        {/* Timestamps */}
        <div className="text-sm text-slate-400 space-y-1">
          <p>Created: {new Date(order.createdAt).toLocaleString()}</p>
          {order.verifiedAt && <p>Verified: {new Date(order.verifiedAt).toLocaleString()}</p>}
          {order.readyAt && <p>Ready: {new Date(order.readyAt).toLocaleString()}</p>}
          {order.servedAt && <p>Served: {new Date(order.servedAt).toLocaleString()}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-700">
          {order.status === 'pending' && onApprove && onReject &&
          <>
              <Button
              variant="danger"
              fullWidth
              onClick={() => {
                onReject(order.id);
                onClose();
              }}>

                Reject Order
              </Button>
              <Button
              variant="primary"
              fullWidth
              onClick={() => {
                onApprove(order);
                onClose();
              }}>

                Approve Order
              </Button>
            </>
          }
          {order.status === 'verified' &&
          <Button variant="secondary" fullWidth disabled>
              Waiting for Kitchen
            </Button>
          }
          {order.status === 'preparing' && onMarkReady &&
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onMarkReady(order.id);
              onClose();
            }}>

              Mark as Ready
            </Button>
          }
          {order.status === 'ready' && onMarkServed &&
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onMarkServed(order.id);
              onClose();
            }}>

              Mark as Served
            </Button>
          }
          {(order.status === 'served' || order.status === 'cancelled') &&
          <Button variant="secondary" fullWidth onClick={onClose}>
              Close
            </Button>
          }
          {!['served', 'cancelled'].includes(order.status) && onCancel && (
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                onCancel(order.id);
                onClose();
              }}
            >
              Cancel Order
            </Button>
          )}
        </div>
      </div>
    </Modal>);

}