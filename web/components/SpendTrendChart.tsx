'use client'
// SpendTrendChart.tsx
// Line chart showing monthly spending over the last 6 months (Recharts)

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface SpendTrendChartProps {
  data: { month: string; total: number }[]
}

export function SpendTrendChart({ data }: SpendTrendChartProps) {
  if (!data.length) {
    return <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ left: 10, right: 10, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 4, fill: '#10b981' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
