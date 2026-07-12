'use client'
// components/shared/DashboardWidgets.tsx
// The approved concept dashboard widgets, promoted to the shared design
// system (app-wide ThemeProvider instead of the concept route's provider):
// spending donut, income/expense lines, budget gauge, client balance bars,
// Tello promo card, team leaderboard, and the recent activity feed.

import {
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
import { useTheme, tone, BRAND } from './theme'
import { formatCurrency } from '@/lib/utils'
import { ArrowUpRight, Sparkles, Receipt as ReceiptIcon } from 'lucide-react'

function useChartTheme() {
  const { dark } = useTheme()
  return {
    dark,
    tick: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)',
    grid: dark ? 'rgba(245,245,247,0.07)' : 'rgba(10,10,15,0.06)',
    tooltipBg: dark ? '#1C1C26' : '#FFFFFF',
    tooltipText: dark ? '#F5F5F7' : '#0A0A0F',
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { dark } = useTheme()
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: dark ? 'rgba(245,245,247,0.55)' : 'rgba(10,10,15,0.50)' }}>
      <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: color }} />
      {label}
    </span>
  )
}

// ── Spending donut with center total ─────────────────────────────────────
const DONUT_COLORS = [BRAND.violet, BRAND.mint, BRAND.amber, '#5B8DEF', '#9E9EA5']

function compactNaira(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}K`
  return `₦${Math.round(n)}`
}

export function SpendDonut({
  data,
  monthLabel,
}: {
  data: { category: string; total: number }[]
  monthLabel: string
}) {
  const t = useChartTheme()
  const { dark } = useTheme()

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
            <Pie data={slices} dataKey="total" nameKey="category" innerRadius={64} outerRadius={90} paddingAngle={2} cornerRadius={4} strokeWidth={0}>
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
      <div className="mt-3 space-y-2.5">
        {slices.map((s, i) => (
          <div key={s.category} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="flex-1 truncate" style={{ color: dark ? 'rgba(245,245,247,0.75)' : 'rgba(10,10,15,0.70)' }}>{s.category}</span>
            <span className="w-10 text-right" style={{ color: t.tick }}>{Math.round((s.total / grand) * 100)}%</span>
            <span className="w-24 text-right font-semibold" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>{formatCurrency(s.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Income vs expenses two-line chart ────────────────────────────────────
export function IncomeExpenseLines({
  data,
}: {
  data: { month: string; income: number; expenses: number }[]
}) {
  const t = useChartTheme()
  return (
    <div>
      <div className="flex justify-end gap-4 mb-2 -mt-9">
        <LegendDot color={BRAND.mint} label="Income" />
        <LegendDot color={BRAND.violet} label="Expenses" />
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
          <Line type="monotone" dataKey="income" stroke={BRAND.mint} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="expenses" stroke={BRAND.violet} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Radial budget gauge ──────────────────────────────────────────────────
export function BudgetGauge({ pctUsed, target }: { pctUsed: number; target: number }) {
  const { dark } = useTheme()
  const clamped = Math.max(0, Math.min(100, pctUsed))
  const sweep = 270
  const angle = (clamped / 100) * sweep
  const r = 74, cx = 100, cy = 100
  const toXY = (deg: number) => {
    const rad = ((deg - 225) * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const [sx, sy] = toXY(0)
  const [ex, ey] = toXY(angle)
  const [tx, ty] = toXY(sweep)
  const largeUsed = angle > 180 ? 1 : 0
  const largeRest = sweep - angle > 180 ? 1 : 0

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="200" height="180" viewBox="0 0 200 180">
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeUsed} 1 ${ex} ${ey}`} fill="none" stroke={BRAND.mint} strokeWidth="14" strokeLinecap="round" />
          <path d={`M ${ex} ${ey} A ${r} ${r} 0 ${largeRest} 1 ${tx} ${ty}`} fill="none" stroke={dark ? 'rgba(245,245,247,0.10)' : 'rgba(10,10,15,0.07)'} strokeWidth="14" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
          <span className="text-4xl font-bold tracking-tight" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>{Math.round(clamped)}%</span>
          <span className="text-xs mt-1" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>of budget used</span>
        </div>
      </div>
      <p className="text-sm -mt-2">
        <span style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>Budget: </span>
        <span className="font-semibold" style={{ color: BRAND.mintDeep }}>{formatCurrency(target)}</span>
      </p>
    </div>
  )
}

// ── Client balance bars ──────────────────────────────────────────────────
export function ClientBalanceBars({ clients }: { clients: { name: string; balance: number }[] }) {
  const { dark } = useTheme()
  const max = Math.max(...clients.map(c => c.balance), 1)
  const colors = [BRAND.mint, BRAND.violetLight, BRAND.violet, BRAND.mintDeep, '#8F88FF']
  return (
    <div className="space-y-4 pt-1">
      {clients.length === 0 && (
        <p className="text-sm py-6 text-center" style={{ color: dark ? 'rgba(245,245,247,0.40)' : 'rgba(10,10,15,0.40)' }}>
          No outstanding client balances 🎉
        </p>
      )}
      {clients.map((c, i) => (
        <div key={c.name + i} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-[13px]" style={{ color: dark ? 'rgba(245,245,247,0.60)' : 'rgba(10,10,15,0.55)' }} title={c.name}>
            {c.name}
          </span>
          <div className="flex-1 h-7 rounded-md overflow-hidden" style={{ background: dark ? 'rgba(245,245,247,0.05)' : 'rgba(10,10,15,0.03)' }}>
            <div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.max((c.balance / max) * 100, 4)}%`, background: colors[i % colors.length] }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[13px] font-semibold" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
            {formatCurrency(c.balance)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Tello promo card ─────────────────────────────────────────────────────
export function TelloPromoCard() {
  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[150px]"
      style={{ background: 'linear-gradient(120deg, #6C63FF 0%, #3D37A6 45%, #0A0A0F 100%)' }}
    >
      <div
        className="absolute inset-0 opacity-25"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
      />
      <div className="relative">
        <p className="text-white text-lg font-semibold leading-snug">Meet Tello,<br />your AI assistant</p>
        <p className="text-sm mt-1.5" style={{ color: 'rgba(245,245,247,0.70)' }}>
          Ask about your spending, clients, budgets and reminders — in plain language.
        </p>
      </div>
      <div className="relative flex items-center justify-between mt-4">
        <div className="flex gap-1">
          <span className="w-5 h-1 rounded-full bg-white" />
          <span className="w-1.5 h-1 rounded-full bg-white/30" />
          <span className="w-1.5 h-1 rounded-full bg-white/30" />
        </div>
        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.14)' }}>
          <Sparkles size={20} className="text-white" />
        </div>
      </div>
    </div>
  )
}

// ── Team leaderboard ─────────────────────────────────────────────────────
export interface LeaderboardMember {
  name: string
  role: string
  receipts: number
  total: number
  sharePct: number
}

export function TeamLeaderboard({ members }: { members: LeaderboardMember[] }) {
  const { dark } = useTheme()
  const t = tone(dark)
  const roleColors: Record<string, string> = {
    owner: BRAND.violet,
    admin: BRAND.mintDeep,
    staff: BRAND.amber,
    family_member: BRAND.mint,
    viewer: '#8E8E93',
  }
  return (
    <div className="space-y-3">
      {members.length === 0 && (
        <p className="text-sm py-6 text-center" style={{ color: t.textDim }}>No team members yet</p>
      )}
      {members.map((m, i) => (
        <div key={m.name + i} className="rounded-xl p-4 border transition-colors duration-300" style={{ borderColor: t.border, background: dark ? 'rgba(245,245,247,0.02)' : '#FFFFFF' }}>
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: t.border }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: roleColors[m.role] ?? BRAND.violet }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: t.text }}>{m.name}</p>
                <p className="text-xs capitalize" style={{ color: t.textDim }}>{m.role.replace('_', ' ')}</p>
              </div>
            </div>
            <span className="text-sm font-bold" style={{ color: BRAND.violet }}>#{i + 1}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div>
              <p className="text-[11px]" style={{ color: t.textDim }}>Receipts</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: t.text }}>{m.receipts}</p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: t.textDim }}>Logged</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: t.text }}>{formatCurrency(m.total)}</p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: t.textDim }}>Share</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: BRAND.mintDeep }}>{m.sharePct}%</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Recent activity feed ─────────────────────────────────────────────────
export interface ActivityItem {
  direction: 'in' | 'out'
  title: string
  subtitle: string
  channel: 'whatsapp' | 'web' | 'mobile' | 'transfer'
  amount: number
  createdAt: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

const CHANNEL_STYLES: Record<ActivityItem['channel'], { label: string; bg: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', bg: 'rgba(37,211,102,0.10)', color: BRAND.whatsapp },
  web:      { label: 'Web',      bg: 'rgba(108,99,255,0.10)', color: BRAND.violet },
  mobile:   { label: 'App',      bg: 'rgba(255,181,69,0.10)', color: BRAND.amber },
  transfer: { label: 'Transfer In', bg: 'rgba(0,212,170,0.10)', color: BRAND.mint },
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const { dark } = useTheme()
  const t = tone(dark)
  return (
    <div>
      {items.length === 0 && (
        <p className="text-sm py-8 text-center" style={{ color: t.textDim }}>
          No activity yet — scan a receipt or log a client payment to see it here.
        </p>
      )}
      <div className="divide-y" style={{ borderColor: t.border }}>
        {items.map((item, i) => {
          const ch = CHANNEL_STYLES[item.channel]
          return (
            <div key={i} className="flex items-center gap-3.5 py-3.5 first:pt-1 last:pb-1">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={
                  item.direction === 'in'
                    ? { background: 'rgba(0,212,170,0.14)', color: BRAND.mintDeep }
                    : { background: t.hover, color: t.textMid }
                }
              >
                {item.direction === 'in' ? <ArrowUpRight size={17} /> : <ReceiptIcon size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{item.title}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: t.textDim }}>{item.subtitle} · {timeAgo(item.createdAt)}</p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: ch.bg, color: ch.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: ch.color }} />
                {ch.label}
              </span>
              <span className="text-sm font-bold shrink-0 w-28 text-right tabular-nums" style={{ color: item.direction === 'in' ? BRAND.mintDeep : t.text }}>
                {item.direction === 'in' ? '+' : '-'}{formatCurrency(item.amount)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
