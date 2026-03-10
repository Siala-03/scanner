import React, { ReactNode } from 'react';
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
interface KPICardProps {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: ReactNode;
  className?: string;
}
export function KPICard({
  label,
  value,
  change,
  trend = 'neutral',
  icon,
  className = ''
}: KPICardProps) {
  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-slate-400'
  };

  const trendBgColors = {
    up: 'bg-green-500/10',
    down: 'bg-red-500/10',
    neutral: 'bg-slate-500/10'
  };

  const TrendIcon =
  trend === 'up' ?
  TrendingUpIcon :
  trend === 'down' ?
  TrendingDownIcon :
  MinusIcon;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 10 }}>
      <Card className={`min-h-[110px] bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition cursor-default ${className}`}>
        <div className="flex items-start justify-between mb-3">
          {icon &&
          <motion.div
            whileHover={{ rotate: 5 }}
            className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              {icon}
            </motion.div>
          }
          {change !== undefined &&
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${trendBgColors[trend]}`}>
            <TrendIcon className={`w-4 h-4 ${trendColors[trend]}`} />
            <span className={`text-xs font-semibold ${trendColors[trend]}`}>
              {trend === 'down' ? '-' : '+'}{Math.abs(change)}%
            </span>
            </motion.div>
          }
        </div>
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-bold text-white mb-1">
            {value}
          </motion.p>
          <p className="text-xs text-slate-400 font-medium">{label}</p>
        </div>
      </Card>
    </motion.div>
  );
}