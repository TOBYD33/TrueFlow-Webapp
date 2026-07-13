'use client'
// app/admin/activity/page.tsx
// Recent platform activity feed — polls /api/admin/activity every 45s.
// Styled with the shared /dashboard-concept design system.

import { useEffect, useState } from 'react'
import { ThemedCard, PageHeader } from '@/components/shared/Cards'
import { useTheme, tone, BRAND } from '@/components/shared/theme'
import { UserPlus, Receipt, ArrowUpRight, CreditCard } from 'lucide-react'

interface Item { type: string; at: string; title: string; sub: string }

const TYPE_STYLE: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  signup:       { icon: <UserPlus size={15} />,    bg: 'rgba(108,99,255,0.12)', color: BRAND.violet },
  receipt:      { icon: <Receipt size={15} />,     bg: 'rgba(255,181,69,0.14)', color: '#D9932A' },
  payment:      { icon: <ArrowUpRight size={15} />, bg: 'rgba(0,212,170,0.12)', color: BRAND.mintDeep },
  subscription: { icon: <CreditCard size={15} />,  bg: 'rgba(108,99,255,0.12)', color: BRAND.violet },
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminActivityPage() {
  const { dark } = useTheme()
  const t = tone(dark)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch('/api/admin/activity')
        const json = await res.json()
        if (alive && json.items) {
          setItems(json.items)
          setLastRefresh(new Date())
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 45_000) // refresh every 45s, no websockets
    return () => { alive = false; clearInterval(timer) }
  }, [])

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Activity"
        subtitle="Signups, receipts, payments and subscription events · last 7 days"
        action={lastRefresh && (
          <span className="text-xs" style={{ color: t.textDim }}>
            Updated {lastRefresh.toLocaleTimeString()} · auto-refreshes
          </span>
        )}
      />

      <ThemedCard>
        {loading ? (
          <p className="text-sm py-8 text-center" style={{ color: t.textDim }}>Loading activity…</p>
        ) : items.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: t.textDim }}>No activity in the last 7 days.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: t.border }}>
            {items.map((item, i) => {
              const s = TYPE_STYLE[item.type] ?? TYPE_STYLE.signup
              return (
                <div key={i} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}>
                    {s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: t.text }}>{item.title}</p>
                    <p className="text-xs truncate" style={{ color: t.textDim }}>{item.sub}</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: t.textDim }}>{timeAgo(item.at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </ThemedCard>
    </div>
  )
}
