import React from 'react';
import { MinusIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { CartItem as CartItemType } from '../../types';
import { formatPrice } from '../../utils/currency';
interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}
export function CartItemCard({
  item,
  onUpdateQuantity,
  onRemove
}: CartItemProps) {
  const subtotal = item.menuItem.price * item.quantity;
  return (
    <div className="flex gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="text-4xl flex-shrink-0">{item.menuItem.emoji}</div>

      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-slate-900 truncate">
          {item.menuItem.name}
        </h4>
        <p className="text-sm text-slate-500">
          {formatPrice(item.menuItem.price)} each
        </p>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
              onUpdateQuantity(item.menuItem.id, item.quantity - 1)
              }
              disabled={item.quantity <= 1}
              className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Decrease quantity">

              <MinusIcon className="w-4 h-4" />
            </button>

            <span className="w-10 text-center font-semibold text-slate-900">
              {item.quantity}
            </span>

            <button
              onClick={() =>
              onUpdateQuantity(item.menuItem.id, item.quantity + 1)
              }
              className="p-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 transition-all"
              aria-label="Increase quantity">

              <PlusIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-bold text-lg text-slate-900">
              {formatPrice(subtotal)}
            </span>

            <button
              onClick={() => onRemove(item.menuItem.id)}
              className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
              aria-label={`Remove ${item.menuItem.name} from cart`}>

              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>);

}