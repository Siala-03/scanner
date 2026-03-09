import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer } from
'recharts';
import { DailyRevenue } from '../../types';
import { formatPrice } from '../../utils/currency';
interface RevenueChartProps {
  data: DailyRevenue[];
  height?: number;
}
export function RevenueChart({ data, height = 300 }: RevenueChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', {
      weekday: 'short'
    })
  }));
  return (
    <div
      style={{
        height
      }}
      className="w-full">

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={formattedData}
          margin={{
            top: 10,
            right: 10,
            left: 0,
            bottom: 0
          }}>

          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01} />
            </linearGradient>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodOpacity={0.3} />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false} />

          <YAxis
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />

          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '2px solid #f59e0b',
              borderRadius: '12px',
              color: '#fff',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}
            formatter={(value: number) => [formatPrice(value), 'Revenue']}
            labelStyle={{
              color: '#f59e0b',
              fontWeight: 'bold'
            }}
            itemStyle={{
              color: '#fbbf24'
            }} />

          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#f59e0b"
            strokeWidth={3}
            fill="url(#revenueGradient)"
            filter="url(#shadow)"
            isAnimationActive={true} />

        </AreaChart>
      </ResponsiveContainer>
    </div>);

}