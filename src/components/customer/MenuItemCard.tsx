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
        y: 20
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      exit={{
        opacity: 0,
        y: -20
      }}
      whileTap={{
        scale: 0.98
      }}
      onClick={() => onViewDetails(item)}
      className="bg-[#2a2018] rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow duration-200 h-full flex flex-col border border-[#3a2e20]">

      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          {item.isPopular ?
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
              Popular
            </span> :

          <div />
          }
        </div>

        <h3 className="font-semibold text-[#e8e4dc] mb-1 line-clamp-1">
          {item.name}
        </h3>

        <p className="text-sm text-[#a89f91] mb-3 line-clamp-2 min-h-[2.5rem]">
          {item.description}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <div>
            <span className="text-lg font-bold text-[#e8e4dc]">
              {formatPrice(getEffectivePrice(item))}
            </span>
            <div className="flex items-center gap-1 text-xs text-[#a89f91] mt-0.5">
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
              p-2.5 rounded-full transition-all duration-200
              ${item.isAvailable ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
            `}
            aria-label={`Add ${item.name} to cart`}>

            <PlusIcon className="w-5 h-5" />
          </button>
        </div>

        {!item.isAvailable &&
        <p className="text-xs text-red-400 mt-2 font-medium">
            Currently unavailable
          </p>
        }
      </div>
    </motion.div>);

}