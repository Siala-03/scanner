import React, { useMemo, useState } from 'react';
import { StarIcon, XIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Order, Staff } from '../../types';
import { addReview } from '../../utils/reviewsStorage';
import { getStaffById } from '../../data/staffData';

interface ServiceReviewModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ServiceReviewModal({ order, isOpen, onClose }: ServiceReviewModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');

  const waiter: Staff | null = useMemo(() => {
    if (!order?.assignedWaiterId) return null;
    return getStaffById(order.assignedWaiterId) ?? null;
  }, [order?.assignedWaiterId]);

  if (!order) return null;

  const canSubmit = !!order.assignedWaiterId && rating >= 1 && rating <= 5;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rate your service" size="md">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-400">Order</p>
            <p className="text-white font-semibold">{order.id} • Table {order.tableNumber}</p>
            <p className="text-sm text-slate-400 mt-1">
              {waiter ? `Waiter: ${waiter.name}` : 'Waiter: (not assigned)'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-300"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div>
          <p className="text-sm text-slate-300 mb-2">Rating</p>
          <div className="flex gap-2">
            {([1, 2, 3, 4, 5] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRating(v)}
                className={`w-10 h-10 rounded-lg border transition-colors flex items-center justify-center ${
                  v <= rating
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
                aria-label={`${v} stars`}
              >
                <StarIcon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-2">Comment (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Tell us about your experience..."
          />
        </div>

        {!order.assignedWaiterId && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            This order is not linked to a waiter yet, so a rating can’t be recorded.
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Later
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!canSubmit}
            onClick={() => {
              if (!order.assignedWaiterId) return;
              addReview({
                id: `rev-${Date.now()}`,
                orderId: order.id,
                tableNumber: order.tableNumber,
                waiterId: order.assignedWaiterId,
                rating,
                comment: comment.trim() ? comment.trim() : undefined,
                createdAt: new Date().toISOString()
              });
              onClose();
            }}
          >
            Submit
          </Button>
        </div>
      </div>
    </Modal>
  );
}

