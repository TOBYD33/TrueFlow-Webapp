'use client'
// CategoryChart.tsx
// Horizontal bar chart showing spending by category (Recharts)

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { formatCurrency, CATEGORY_COLORS } from '@/lib/utils'

interface CategoryChartProps {
  data: { category: string; total: number }[]
}

export function CategoryChart({ data }: CategoryChartProps) {
  if (!data.length) {
    return <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="category" tick={{ fontSize: 12 }} width={80} />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
          {data.map(entry => (
            <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? '#6b7280'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
