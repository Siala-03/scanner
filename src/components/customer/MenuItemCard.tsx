import React from 'react';
import { motion } from 'framer-motion';
import { PlusIcon, ClockIcon } from 'lucide-react';
import { MenuItem } from '../../types';
import { formatPrice } from '../../utils/currency';
import { getEffectivePrice } from '../../utils/pricing';
interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  onViewDetails: (item: MenuItem) => void;
}
export function MenuItemCard({
  item,
  onAddToCart,
  onViewDetails
}: MenuItemCardProps) {
  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        y: 10
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      exit={{
        opacity: 0,
        y: -10
      }}
      whileTap={{
        scale: 0.985
      }}
      onClick={() => onViewDetails(item)}
      className="bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200 h-full flex flex-col border border-slate-200">

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          {item.isPopular ? (
            <span className="px-2 py-0.5 bg-slate-900 text-white text-xs font-semibold rounded-full">
              Popular
            </span>
          ) : (
            <div className="h-0.5 w-0.5" />
          )}
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">{item.category}</span>
        </div>

        <h3 className="font-semibold text-slate-900 mb-1 line-clamp-1">
          {item.name}
        </h3>

        <p className="text-sm text-slate-500 mb-3 line-clamp-2 min-h-[2.5rem]">
          {item.description}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <div>
            <span className="text-lg font-bold text-slate-900">
              {formatPrice(getEffectivePrice(item))}
            </span>
            <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
              <ClockIcon className="w-3 h-3" />
              <span>{item.prepTime} min</span>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(item);
            }}
            disabled={!item.isAvailable}
            className={`
              px-3 py-2 rounded-full transition-all duration-200 text-sm font-semibold
              ${item.isAvailable ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm hover:shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}
            `}
            aria-label={`Add ${item.name} to cart`}>
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>


      </div>
    </motion.div>
  );
}
