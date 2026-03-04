import React from 'react';
import { StarIcon, ClockIcon, MapPinIcon } from 'lucide-react';
import { Staff } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
interface StaffCardProps {
  staff: Staff;
  onAssignTables?: (staffId: string) => void;
  onViewDetails?: (staff: Staff) => void;
}
export function StaffCard({
  staff,
  onAssignTables,
  onViewDetails
}: StaffCardProps) {
  const roleColors = {
    waiter: 'bg-blue-500/20 text-blue-400',
    supervisor: 'bg-purple-500/20 text-purple-400',
    manager: 'bg-amber-500/20 text-amber-400',
    kitchen: 'bg-orange-500/20 text-orange-400'
  };
  return (
    <Card className="bg-slate-800">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium text-lg">
            {staff.name.
            split(' ').
            map((n) => n[0]).
            join('')}
          </div>
          <div>
            <p className="font-semibold text-white">{staff.name}</p>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[staff.role]}`}>

              {staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}
            </span>
          </div>
        </div>
        <Badge variant={staff.isOnDuty ? 'ready' : 'served'} size="sm">
          {staff.isOnDuty ? 'On Duty' : 'Off Duty'}
        </Badge>
      </div>

      {staff.role === 'waiter' &&
      <>
          <div className="flex items-center gap-4 mb-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-400">
              <MapPinIcon className="w-4 h-4" />
              <span>
                {staff.assignedTables.length > 0 ?
              `Tables ${staff.assignedTables.join(', ')}` :
              'No tables assigned'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4 p-3 rounded-lg bg-slate-700/50">
            <div className="text-center">
              <p className="text-lg font-bold text-white">
                {staff.performance.ordersServed}
              </p>
              <p className="text-xs text-slate-400">Orders</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">
                {staff.performance.avgServiceTime}m
              </p>
              <p className="text-xs text-slate-400">Avg Time</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <StarIcon className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-lg font-bold text-white">
                  {staff.performance.rating}
                </span>
              </div>
              <p className="text-xs text-slate-400">Rating</p>
            </div>
          </div>

          <div className="flex gap-2">
            {onAssignTables &&
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => onAssignTables(staff.id)}>

                Assign Tables
              </Button>
          }
            {onViewDetails &&
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewDetails(staff)}>

                Details
              </Button>
          }
          </div>
        </>
      }

      {staff.role !== 'waiter' &&
      <div className="text-sm text-slate-400">
          <p>Email: {staff.email}</p>
          <p>Phone: {staff.phone}</p>
          <p>Hired: {staff.hireDate.toLocaleDateString()}</p>
        </div>
      }
    </Card>);

}