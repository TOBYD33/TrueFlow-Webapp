// api/admin/revenue/route.ts
// Revenue reporting from EXISTING data: subscription_events payment history
// (charge.completed payloads), organizations.plan distribution, and the
// andrea_contributions running total. No new payment table (business rule 7).
// Super + Finance (and readonly for viewing) — Support is excluded from
// revenue data per the original Layer 1 role spec.

import { NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'

const PLAN_PRICES: Record<string, number> = {
  free: 0, individual: 2500, family: 5000, freelancer: 5000,
  sme_starter: 7500, agency: 12000, sme_pro: 15000, studio: 25000, enterprise: 0,
}

export async function GET() {
  const auth = await requireAdmin(['super', 'finance', 'readonly'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = getAdminClient()
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)

  const [eventsRes, orgsRes, andreaRes] = await Promise.all([
    admin.from('subscription_events')
      .select('created_at, payload')
      .eq('event_type', 'charge.completed')
      .gte('created_at', yearAgo.toISOString())
      .order('created_at', { ascending: true }),
    admin.from('organizations').select('plan'),
    admin.from('andrea_contributions').select('amount'),
  ])

  // Payments: amount lives in the logged webhook/verification payload
  const payments = ((eventsRes.data ?? []) as any[])
    .map(e => ({ at: new Date(e.created_at), amount: Number(e.payload?.amount ?? 0) }))
    .filter(p => p.amount > 0)

  const now = new Date()
  const sumBetween = (start: Date, end: Date) =>
    payments.filter(p => p.at >= start && p.at < end).reduce((s, p) => s + p.amount, 0)

  const dayMs = 24 * 60 * 60 * 1000
  const weekStart = new Date(now.getTime() - 7 * dayMs)
  const prevWeekStart = new Date(now.getTime() - 14 * dayMs)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const quarter = Math.floor(now.getMonth() / 3)
  const quarterStart = new Date(now.getFullYear(), quarter * 3, 1)
  const prevQuarterStart = new Date(now.getFullYear(), (quarter - 1) * 3, 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1)
  const prevYearSameDay = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

  const pct = (cur: number, prev: number): number | null =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null

  const week = sumBetween(weekStart, now)
  const prevWeek = sumBetween(prevWeekStart, weekStart)
  const month = sumBetween(monthStart, now)
  const prevMonth = sumBetween(prevMonthStart, monthStart)
  const qtr = sumBetween(quarterStart, now)
  const prevQtr = sumBetween(prevQuarterStart, quarterStart)
  const year = sumBetween(yearStart, now)
  const prevYear = sumBetween(prevYearStart, prevYearSameDay)

  // Monthly series for the chart (last 12 months)
  const series = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const dEnd = new Date(now.getFullYear(), now.getMonth() - (10 - i), 1)
    return {
      label: d.toLocaleString('default', { month: 'short' }),
      revenue: sumBetween(d, dEnd),
    }
  })

  // Plan distribution: org count + implied monthly revenue per tier
  const planCounts: Record<string, number> = {}
  for (const o of (orgsRes.data ?? []) as any[]) {
    planCounts[o.plan] = (planCounts[o.plan] ?? 0) + 1
  }
  const plans = Object.entries(planCounts)
    .map(([plan, count]) => ({ plan, count, monthlyRevenue: count * (PLAN_PRICES[plan] ?? 0) }))
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)

  const andreaTotal = ((andreaRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)

  return NextResponse.json({
    cards: [
      { label: 'This Week', value: week, change: pct(week, prevWeek) },
      { label: 'This Month', value: month, change: pct(month, prevMonth) },
      { label: 'This Quarter', value: qtr, change: pct(qtr, prevQtr) },
      { label: 'This Year', value: year, change: pct(year, prevYear) },
    ],
    series,
    plans,
    andreaTotal,
    paymentCount: payments.length,
  })
}
