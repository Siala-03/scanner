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
  avgRating?: number | null;
  reviewCount?: number;
}

export function MenuItemCard({
  item,
  onAddToCart,
  onViewDetails,
  avgRating,
  reviewCount = 0,
}: MenuItemCardProps) {
  const effectivePrice = getEffectivePrice(item);

  return (
    <motion.div
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
      className="relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 h-full flex flex-col border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] hover:shadow-[0_14px_36px_rgba(15,23,42,0.15)] hover:-translate-y-0.5 hover:border-amber-300 group active:scale-95"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 opacity-90" />

      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            {item.isPopular ? (
              <span className="px-2 py-1 sm:px-2.5 sm:py-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-semibold rounded-full flex items-center gap-1 shadow-md shadow-amber-500/25">
                <StarIcon className="w-3 h-3 fill-current" />
                <span className="hidden sm:inline">Popular</span>
              </span>
            ) : (
              <span className="px-2 py-1 rounded-full text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200">{item.emoji || '🍽️'}</span>
            )}
          </div>
          <span className="text-xs uppercase tracking-[0.14em] text-slate-600 font-semibold bg-slate-100 px-2 py-1 rounded-full border border-slate-200 hidden sm:block">
            {item.category}
          </span>
        </div>

        <h3 className="font-bold text-slate-900 mb-1.5 text-base sm:text-lg leading-tight group-hover:text-amber-700 transition-colors line-clamp-2">
          {item.name}
        </h3>

        <p className="text-sm text-slate-600 mb-3 sm:mb-4 line-clamp-2 min-h-[2.6rem] leading-relaxed flex-1">
          {item.description}
        </p>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-200/80 gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900 block tracking-tight">
              {formatPrice(effectivePrice)}
            </span>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                <ClockIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{item.prepTime} min</span>
              </div>
              {avgRating != null && reviewCount > 0 && (
                <div className="flex items-center gap-0.5 text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  <StarIcon className="w-3 h-3 fill-amber-500 text-amber-500 flex-shrink-0" />
                  <span>{avgRating.toFixed(1)}</span>
                  <span className="text-slate-500 font-medium">({reviewCount})</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(item);
            }}
            disabled={!item.isAvailable}
            className={`
              px-3 py-2 sm:px-4 sm:py-2.5 rounded-full transition-all duration-200 text-sm font-semibold touch-manipulation flex-shrink-0 border
              ${item.isAvailable 
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-500 hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40 active:scale-95' 
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-300'}
            `}
            aria-label={`Add ${item.name} to cart`}>
            <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {!item.isAvailable && (
          <div className="mt-3 inline-flex items-center self-start rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            Currently unavailable
          </div>
        )}


      </div>
    </motion.div>
  );
}
