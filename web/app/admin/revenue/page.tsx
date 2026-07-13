'use client'
// app/admin/revenue/page.tsx
// Revenue reporting in the concept visual language: period stat cards with
// % change, revenue-over-time line chart (same style as Income vs
// Expenses), plan distribution, Andrea Aid running total.

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ThemedCard, ThemedStatCard, PageHeader } from '@/components/shared/Cards'
import { useTheme, tone, BRAND } from '@/components/shared/theme'
import { formatCurrency } from '@/lib/utils'
import { Heart } from 'lucide-react'

interface RevenueData {
  cards: { label: string; value: number; change: number | null }[]
  series: { label: string; revenue: number }[]
  plans: { plan: string; count: number; monthlyRevenue: number }[]
  andreaTotal: number
  paymentCount: number
}

export default function AdminRevenuePage() {
  const { dark } = useTheme()
  const t = tone(dark)
  const [data, setData] = useState<RevenueData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/revenue')
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? 'Failed to load')
        setData(json)
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) {
    return <p className="text-sm py-8" style={{ color: t.textDim }}>{error === 'Forbidden' ? 'Your admin role does not include revenue access.' : error}</p>
  }
  if (!data) {
    return <p className="text-sm py-8" style={{ color: t.textDim }}>Loading revenue…</p>
  }

  const maxPlanRevenue = Math.max(...data.plans.map(p => p.monthlyRevenue), 1)

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader title="Revenue" subtitle={`${data.paymentCount} subscription payments recorded in the last 12 months`} />

      {/* Period cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.cards.map(c => (
          <ThemedStatCard
            key={c.label}
            label={c.label}
            value={formatCurrency(c.value)}
            change={c.change}
            changeLabel="vs prior period"
          />
        ))}
      </div>

      {/* Revenue over time */}
      <ThemedCard title="Revenue Over Time (monthly)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.series}>
            <CartesianGrid vertical={false} stroke={dark ? 'rgba(245,245,247,0.07)' : 'rgba(10,10,15,0.06)'} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: t.textDim, fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: t.textDim, fontSize: 12 }} width={52}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip
              contentStyle={{ background: dark ? '#1C1C26' : '#FFFFFF', border: 'none', borderRadius: 12, color: t.text, fontSize: 13 }}
              formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Revenue']}
            />
            <Line type="monotone" dataKey="revenue" stroke={BRAND.violet} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </ThemedCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Plan distribution */}
        <ThemedCard title="Plan Distribution">
          <div className="space-y-3 pt-1">
            {data.plans.map(p => (
              <div key={p.plan} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-[13px] capitalize" style={{ color: t.textMid }}>
                  {p.plan.replace('_', ' ')}
                </span>
                <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: t.hover }}>
                  <div
                    className="h-full rounded-md"
                    style={{
                      width: `${Math.max((p.monthlyRevenue / maxPlanRevenue) * 100, 3)}%`,
                      background: p.plan === 'free' ? '#9E9EA5' : BRAND.violet,
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-[13px]" style={{ color: t.textDim }}>
                  {p.count} org{p.count === 1 ? '' : 's'}
                </span>
                <span className="w-24 shrink-0 text-right text-[13px] font-semibold" style={{ color: t.text }}>
                  {formatCurrency(p.monthlyRevenue)}
                </span>
              </div>
            ))}
          </div>
        </ThemedCard>

        {/* Andrea Aid total */}
        <ThemedCard title="Andrea Aid Contributions">
          <div className="flex flex-col items-center justify-center py-6">
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(0,212,170,0.12)' }}>
              <Heart size={20} style={{ color: BRAND.mint }} className="fill-current" />
            </div>
            <p className="text-3xl font-bold tracking-tight" style={{ color: BRAND.mintDeep }}>
              {formatCurrency(data.andreaTotal)}
            </p>
            <p className="text-xs mt-1" style={{ color: t.textDim }}>
              total routed to Andrea (2% of every subscription)
            </p>
          </div>
        </ThemedCard>
      </div>
    </div>
  )
}
