'use client'
// components/dashboard-concept/ConceptCards.tsx
// All card building blocks for the concept dashboard: base card, stat cards
// with % change chips, radial budget gauge, client balance bar list, Tello
// promo card, and the team leaderboard. Scoped to /dashboard-concept only.

import { useConcept } from './ConceptProvider'
import { formatCurrency } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Sparkles, Receipt as ReceiptIcon } from 'lucide-react'

// ── Base card ───────────────────────────────────────────────────────────
export function ConceptCard({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const { dark } = useConcept()
  return (
    <div
      className={`rounded-2xl p-5 transition-colors duration-300 ${className}`}
      style={{
        background: dark ? '#14141B' : '#FFFFFF',
        boxShadow: dark ? 'none' : '0 1px 3px rgba(10,10,15,0.05), 0 8px 24px rgba(10,10,15,0.04)',
        border: dark ? '1px solid rgba(245,245,247,0.07)' : '1px solid rgba(10,10,15,0.04)',
      }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-[15px] font-semibold" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Stat card with % change chip ────────────────────────────────────────
export function ConceptStatCard({
  label,
  value,
  change,
  icon,
}: {
  label: string
  value: string
  change: number | null // percentage vs last month; null = no comparison
  icon: React.ReactNode
}) {
  const { dark } = useConcept()
  const up = (change ?? 0) >= 0
  return (
    <ConceptCard>
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium" style={{ color: dark ? 'rgba(245,245,247,0.55)' : 'rgba(10,10,15,0.50)' }}>
          {label}
        </p>
        <span style={{ color: '#6C63FF' }}>{icon}</span>
      </div>
      <p className="text-[26px] font-bold mt-1.5 tracking-tight" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
        {value}
      </p>
      <div className="flex items-center gap-1.5 mt-1.5">
        {change !== null ? (
          <>
            <span
              className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md"
              style={
                up
                  ? { background: 'rgba(0,212,170,0.12)', color: '#00A88A' }
                  : { background: 'rgba(255,107,107,0.12)', color: '#FF6B6B' }
              }
            >
              {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(change)}%
            </span>
            <span className="text-xs" style={{ color: dark ? 'rgba(245,245,247,0.40)' : 'rgba(10,10,15,0.40)' }}>
              to last month
            </span>
          </>
        ) : (
          <span className="text-xs" style={{ color: dark ? 'rgba(245,245,247,0.40)' : 'rgba(10,10,15,0.40)' }}>
            this month
          </span>
        )}
      </div>
    </ConceptCard>
  )
}

// ── Radial budget gauge (CSAT-style) ────────────────────────────────────
export function ConceptGauge({ pctUsed, target }: { pctUsed: number; target: number }) {
  const { dark } = useConcept()
  const clamped = Math.max(0, Math.min(100, pctUsed))
  // Gauge sweeps 270° starting bottom-left
  const sweep = 270
  const angle = (clamped / 100) * sweep
  const r = 74
  const cx = 100
  const cy = 100
  const toXY = (deg: number) => {
    const rad = ((deg - 225) * Math.PI) / 180 // start at 225° (bottom-left)
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
          {/* Track */}
          <path
            d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeUsed} 1 ${ex} ${ey}`}
            fill="none"
            stroke="#00D4AA"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d={`M ${ex} ${ey} A ${r} ${r} 0 ${largeRest} 1 ${tx} ${ty}`}
            fill="none"
            stroke={dark ? 'rgba(245,245,247,0.10)' : 'rgba(10,10,15,0.07)'}
            strokeWidth="14"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
          <span className="text-4xl font-bold tracking-tight" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
            {Math.round(clamped)}%
          </span>
          <span className="text-xs mt-1" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>
            of budget used
          </span>
        </div>
      </div>
      <p className="text-sm -mt-2">
        <span style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>Budget: </span>
        <span className="font-semibold" style={{ color: '#00A88A' }}>{formatCurrency(target)}</span>
      </p>
    </div>
  )
}

// ── Horizontal client balance bars (Sentiment-style) ────────────────────
export function ConceptClientBars({
  clients,
}: {
  clients: { name: string; balance: number }[]
}) {
  const { dark } = useConcept()
  const max = Math.max(...clients.map(c => c.balance), 1)
  const colors = ['#00D4AA', '#B7B2FF', '#6C63FF', '#00A88A', '#8F88FF']
  return (
    <div className="space-y-4 pt-1">
      {clients.length === 0 && (
        <p className="text-sm py-6 text-center" style={{ color: dark ? 'rgba(245,245,247,0.40)' : 'rgba(10,10,15,0.40)' }}>
          No outstanding client balances 🎉
        </p>
      )}
      {clients.map((c, i) => (
        <div key={c.name + i} className="flex items-center gap-3">
          <span
            className="w-24 shrink-0 truncate text-[13px]"
            style={{ color: dark ? 'rgba(245,245,247,0.60)' : 'rgba(10,10,15,0.55)' }}
            title={c.name}
          >
            {c.name}
          </span>
          <div className="flex-1 h-7 rounded-md overflow-hidden" style={{ background: dark ? 'rgba(245,245,247,0.05)' : 'rgba(10,10,15,0.03)' }}>
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{ width: `${Math.max((c.balance / max) * 100, 4)}%`, background: colors[i % colors.length] }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-[13px] font-semibold" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
            {formatCurrency(c.balance)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Recent activity feed: money in & out, all channels ──────────────────
export interface ActivityItem {
  direction: 'in' | 'out'
  title: string       // "Adunni Okafor · Brand Identity" / "Shoprite Lekki · Groceries"
  subtitle: string    // "Payment received" / "Receipt scanned"
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
  whatsapp: { label: 'WhatsApp', bg: 'rgba(37,211,102,0.10)', color: '#25D366' },
  web:      { label: 'Web',      bg: 'rgba(108,99,255,0.10)', color: '#6C63FF' },
  mobile:   { label: 'App',      bg: 'rgba(255,181,69,0.10)', color: '#FFB545' },
  transfer: { label: 'Transfer In', bg: 'rgba(0,212,170,0.10)', color: '#00D4AA' },
}

export function ConceptActivity({ items }: { items: ActivityItem[] }) {
  const { dark } = useConcept()
  return (
    <div>
      {items.length === 0 && (
        <p className="text-sm py-8 text-center" style={{ color: dark ? 'rgba(245,245,247,0.40)' : 'rgba(10,10,15,0.40)' }}>
          No activity yet — scan a receipt or log a client payment to see it here.
        </p>
      )}
      <div className="divide-y" style={{ borderColor: dark ? 'rgba(245,245,247,0.06)' : 'rgba(10,10,15,0.05)' }}>
        {items.map((item, i) => {
          const ch = CHANNEL_STYLES[item.channel]
          return (
            <div key={i} className="flex items-center gap-3.5 py-3.5 first:pt-1 last:pb-1">
              {/* Direction icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={
                  item.direction === 'in'
                    ? { background: 'rgba(0,212,170,0.14)', color: '#00A88A' }
                    : { background: dark ? 'rgba(245,245,247,0.06)' : 'rgba(10,10,15,0.05)', color: dark ? 'rgba(245,245,247,0.55)' : 'rgba(10,10,15,0.45)' }
                }
              >
                {item.direction === 'in' ? <ArrowUpRight size={17} /> : <ReceiptIcon size={16} />}
              </div>

              {/* Title + subtitle */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
                  {item.title}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>
                  {item.subtitle} · {timeAgo(item.createdAt)}
                </p>
              </div>

              {/* Channel badge */}
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                style={{ background: ch.bg, color: ch.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: ch.color }} />
                {ch.label}
              </span>

              {/* Signed amount */}
              <span
                className="text-sm font-bold shrink-0 w-28 text-right tabular-nums"
                style={{ color: item.direction === 'in' ? '#00A88A' : dark ? '#F5F5F7' : '#0A0A0F' }}
              >
                {item.direction === 'in' ? '+' : '-'}{formatCurrency(item.amount)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Dark gradient Tello promo card ──────────────────────────────────────
export function ConceptTelloCard() {
  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[150px]"
      style={{ background: 'linear-gradient(120deg, #6C63FF 0%, #3D37A6 45%, #0A0A0F 100%)' }}
    >
      {/* Decorative dots */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />
      <div className="relative">
        <p className="text-white text-lg font-semibold leading-snug">
          Meet Tello,<br />your AI assistant
        </p>
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

// ── Team leaderboard (Agent Leaderboard-style) ──────────────────────────
export interface LeaderboardMember {
  name: string
  role: string
  receipts: number
  total: number
  sharePct: number
}

export function ConceptLeaderboard({ members }: { members: LeaderboardMember[] }) {
  const { dark } = useConcept()
  const roleColors: Record<string, string> = {
    owner: '#6C63FF',
    admin: '#00A88A',
    staff: '#FFB545',
    family_member: '#00D4AA',
    viewer: '#8E8E93',
  }
  return (
    <div className="space-y-3">
      {members.length === 0 && (
        <p className="text-sm py-6 text-center" style={{ color: dark ? 'rgba(245,245,247,0.40)' : 'rgba(10,10,15,0.40)' }}>
          No team members yet
        </p>
      )}
      {members.map((m, i) => (
        <div
          key={m.name + i}
          className="rounded-xl p-4 border transition-colors duration-300"
          style={{
            borderColor: dark ? 'rgba(245,245,247,0.08)' : 'rgba(10,10,15,0.06)',
            background: dark ? 'rgba(245,245,247,0.02)' : '#FFFFFF',
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: dark ? 'rgba(245,245,247,0.06)' : 'rgba(10,10,15,0.05)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: roleColors[m.role] ?? '#6C63FF' }}
              >
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>{m.name}</p>
                <p className="text-xs capitalize" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>
                  {m.role.replace('_', ' ')}
                </p>
              </div>
            </div>
            <span className="text-sm font-bold" style={{ color: '#6C63FF' }}>#{i + 1}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div>
              <p className="text-[11px]" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>Receipts</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>{m.receipts}</p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>Logged</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>{formatCurrency(m.total)}</p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.45)' }}>Share</p>
              <p className="text-[15px] font-bold mt-0.5" style={{ color: '#00A88A' }}>{m.sharePct}%</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
