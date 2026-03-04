import React from 'react';
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from 'lucide-react';
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
  const TrendIcon =
  trend === 'up' ?
  TrendingUpIcon :
  trend === 'down' ?
  TrendingDownIcon :
  MinusIcon;
  return (
    <Card className={`bg-slate-800 ${className}`}>
      <div className="flex items-start justify-between">
        {icon &&
        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
            {icon}
          </div>
        }
        {change !== undefined &&
        <div className={`flex items-center gap-1 ${trendColors[trend]}`}>
            <TrendIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{Math.abs(change)}%</span>
          </div>
        }
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </Card>);

}