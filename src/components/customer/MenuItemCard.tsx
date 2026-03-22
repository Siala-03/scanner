import React from 'react';
import { motion } from 'framer-motion';
import { PlusIcon, ClockIcon, StarIcon } from 'lucide-react';
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
      className="bg-white rounded-2xl overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 h-full flex flex-col border border-slate-100 hover:border-amber-200 group"
    >

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-3">
          {item.isPopular ? (
            <span className="px-2.5 py-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-semibold rounded-full flex items-center gap-1 shadow-md shadow-amber-500/25">
              <StarIcon className="w-3 h-3 fill-current" />
              Popular
            </span>
          ) : (
            <div className="h-0.5 w-0.5" />
          )}
          <span className="text-xs uppercase tracking-[0.15em] text-slate-400 font-medium">{item.category}</span>
        </div>

        <h3 className="font-bold text-slate-900 mb-1.5 text-lg group-hover:text-amber-700 transition-colors">
          {item.name}
        </h3>

        <p className="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[2.5rem] leading-relaxed">
          {item.description}
        </p>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
          <div>
            <span className="text-xl font-bold text-slate-900">
              {formatPrice(getEffectivePrice(item))}
            </span>
            <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
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
              px-4 py-2.5 rounded-full transition-all duration-200 text-sm font-semibold
              ${item.isAvailable 
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40' 
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}
            `}
            aria-label={`Add ${item.name} to cart`}>
            <PlusIcon className="w-5 h-5" />
          </button>
        </div>


      </div>
    </motion.div>
  );
}
