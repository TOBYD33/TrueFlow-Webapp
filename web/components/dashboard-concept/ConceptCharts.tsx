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
  PieChart,
  Pie,
  Cell,
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

// ── Spending donut: categories this month with center total ────────────
const DONUT_COLORS = ['#6C63FF', '#00D4AA', '#FFB545', '#5B8DEF', '#9E9EA5']

function compactNaira(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}K`
  return `₦${Math.round(n)}`
}

export function ConceptSpendDonut({
  data,
  monthLabel,
}: {
  data: { category: string; total: number }[]
  monthLabel: string
}) {
  const t = useChartTheme()
  const { dark } = useConcept()

  // Top 4 categories + everything else grouped as "Other"
  const sorted = [...data].sort((a, b) => b.total - a.total)
  const top = sorted.slice(0, 4)
  const otherTotal = sorted.slice(4).reduce((s, d) => s + d.total, 0)
  const slices = [...top, ...(otherTotal > 0 ? [{ category: 'Other', total: otherTotal }] : [])]
  const grand = slices.reduce((s, d) => s + d.total, 0)

  if (grand === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm" style={{ color: t.tick }}>
        No spending recorded for {monthLabel} yet.
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs -mt-3 mb-1" style={{ color: t.tick }}>{monthLabel} · money out</p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="category"
              innerRadius={64}
              outerRadius={90}
              paddingAngle={2}
              cornerRadius={4}
              strokeWidth={0}
            >
              {slices.map((s, i) => (
                <Cell key={s.category} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: t.tooltipBg, border: 'none', borderRadius: 12, color: t.tooltipText, fontSize: 13 }}
              formatter={(value) => [formatCurrency(Number(value ?? 0)), '']}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold tracking-tight" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
            {compactNaira(grand)}
          </span>
          <span className="text-xs" style={{ color: t.tick }}>total out</span>
        </div>
      </div>

      {/* Legend list: dot · category · % · amount */}
      <div className="mt-3 space-y-2.5">
        {slices.map((s, i) => (
          <div key={s.category} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="flex-1 truncate" style={{ color: dark ? 'rgba(245,245,247,0.75)' : 'rgba(10,10,15,0.70)' }}>
              {s.category}
            </span>
            <span className="w-10 text-right" style={{ color: t.tick }}>
              {Math.round((s.total / grand) * 100)}%
            </span>
            <span className="w-24 text-right font-semibold" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
              {formatCurrency(s.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
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
