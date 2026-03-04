import React from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingCartIcon,
  CheckCircleIcon,
  BellIcon,
  UtensilsIcon,
  XCircleIcon,
  UserPlusIcon,
  UserMinusIcon,
  EditIcon,
  MapPinIcon } from
'lucide-react';
import { Activity, ActivityType } from '../../types';
interface ActivityFeedProps {
  activities: Activity[];
  maxItems?: number;
}
const activityIcons: Record<ActivityType, React.ElementType> = {
  order_placed: ShoppingCartIcon,
  order_verified: CheckCircleIcon,
  order_ready: BellIcon,
  order_served: UtensilsIcon,
  order_cancelled: XCircleIcon,
  staff_clock_in: UserPlusIcon,
  staff_clock_out: UserMinusIcon,
  menu_updated: EditIcon,
  table_assigned: MapPinIcon
};
const activityColors: Record<ActivityType, string> = {
  order_placed: 'bg-blue-500/20 text-blue-400',
  order_verified: 'bg-green-500/20 text-green-400',
  order_ready: 'bg-amber-500/20 text-amber-400',
  order_served: 'bg-purple-500/20 text-purple-400',
  order_cancelled: 'bg-red-500/20 text-red-400',
  staff_clock_in: 'bg-green-500/20 text-green-400',
  staff_clock_out: 'bg-slate-500/20 text-slate-400',
  menu_updated: 'bg-blue-500/20 text-blue-400',
  table_assigned: 'bg-amber-500/20 text-amber-400'
};
export function ActivityFeed({ activities, maxItems = 10 }: ActivityFeedProps) {
  const displayedActivities = activities.slice(0, maxItems);
  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };
  return (
    <div className="space-y-3">
      {displayedActivities.map((activity, index) => {
        const Icon = activityIcons[activity.type];
        const colorClass = activityColors[activity.type];
        return (
          <motion.div
            key={activity.id}
            initial={{
              opacity: 0,
              x: -20
            }}
            animate={{
              opacity: 1,
              x: 0
            }}
            transition={{
              delay: index * 0.05
            }}
            className="flex items-start gap-3">

            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>

              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300">{activity.description}</p>
              <p className="text-xs text-slate-500">
                {formatTime(activity.timestamp)}
              </p>
            </div>
          </motion.div>);

      })}
    </div>);

}