'use client'
// components/dashboard-concept/ConceptCharts.tsx
// Recharts wrappers for the concept dashboard, styled after the reference
// screenshots: stacked two-tone violet bars (Call Volume style) and a
// two-line violet/mint chart with gradient fills (Avg Handle Time style).
// Scoped to /dashboard-concept only.

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useConcept } from './ConceptProvider'
import { formatCurrency } from '@/lib/utils'

const VIOLET = '#6C63FF'
const VIOLET_LIGHT = '#C9C5FF'
const MINT = '#00D4AA'

function useChartTheme() {
  const { dark } = useConcept()
  return {
    dark,
    tick: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)',
    grid: dark ? 'rgba(245,245,247,0.07)' : 'rgba(10,10,15,0.06)',
    tooltipBg: dark ? '#1C1C26' : '#FFFFFF',
    tooltipText: dark ? '#F5F5F7' : '#0A0A0F',
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { dark } = useConcept()
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: dark ? 'rgba(245,245,247,0.55)' : 'rgba(10,10,15,0.50)' }}>
      <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: color }} />
      {label}
    </span>
  )
}

// ── Spending bar chart: top category vs everything else, stacked ────────
export function ConceptSpendBars({
  data,
}: {
  data: { month: string; top: number; rest: number }[]
}) {
  const t = useChartTheme()
  return (
    <div>
      <div className="flex justify-end gap-4 mb-2 -mt-9">
        <LegendDot color={VIOLET_LIGHT} label="Other categories" />
        <LegendDot color={VIOLET} label="Top category" />
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} barSize={26}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: t.tick, fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: t.tick, fontSize: 12 }} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip
            cursor={{ fill: t.dark ? 'rgba(245,245,247,0.04)' : 'rgba(10,10,15,0.03)' }}
            contentStyle={{ background: t.tooltipBg, border: 'none', borderRadius: 12, color: t.tooltipText, fontSize: 13 }}
            formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name === 'top' ? 'Top category' : 'Other categories']}
          />
          <Bar dataKey="top" stackId="a" fill={VIOLET} radius={[0, 0, 4, 4]} />
          <Bar dataKey="rest" stackId="a" fill={VIOLET_LIGHT} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Income vs expenses two-line chart ───────────────────────────────────
export function ConceptIncomeExpenseLines({
  data,
}: {
  data: { month: string; income: number; expenses: number }[]
}) {
  const t = useChartTheme()
  return (
    <div>
      <div className="flex justify-end gap-4 mb-2 -mt-9">
        <LegendDot color={MINT} label="Income" />
        <LegendDot color={VIOLET} label="Expenses" />
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: t.tick, fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: t.tick, fontSize: 12 }} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip
            contentStyle={{ background: t.tooltipBg, border: 'none', borderRadius: 12, color: t.tooltipText, fontSize: 13 }}
            formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name === 'income' ? 'Income' : 'Expenses']}
          />
          <Line type="monotone" dataKey="income" stroke={MINT} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="expenses" stroke={VIOLET} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
