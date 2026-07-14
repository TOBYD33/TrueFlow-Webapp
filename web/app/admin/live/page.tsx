'use client'
// app/admin/live/page.tsx
// Live/online users — orgs with WhatsApp activity in the last 5 minutes.
// Honest scope: this tracks WhatsApp bot activity (a real signal, updated
// on every message), not web-tab presence — there's no websocket/presence
// system for the web app. Polls every 20s.

import { useEffect, useState } from 'react'
import { ThemedCard, PageHeader } from '@/components/shared/Cards'
import { useTheme, tone, BRAND } from '@/components/shared/theme'
import { MessageCircle } from 'lucide-react'

interface LiveUser { phone: string; orgName: string; plan: string; lastActiveAt: string }

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

export default function AdminLivePage() {
  const { dark } = useTheme()
  const t = tone(dark)
  const [users, setUsers] = useState<LiveUser[]>([])
  const [windowMinutes, setWindowMinutes] = useState(5)
  const [loading, setLoading] = useState(true)
  const [lastPoll, setLastPoll] = useState<Date | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch('/api/admin/live')
        const json = await res.json()
        if (alive && json.users) {
          setUsers(json.users)
          setWindowMinutes(json.windowMinutes ?? 5)
          setLastPoll(new Date())
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 20_000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Live Now"
        subtitle={`WhatsApp activity in the last ${windowMinutes} minutes`}
        action={lastPoll && <span className="text-xs" style={{ color: t.textDim }}>Updated {lastPoll.toLocaleTimeString()} · polls every 20s</span>}
      />

      <ThemedCard
        title={`${users.length} active on WhatsApp`}
        action={
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,212,170,0.12)', color: BRAND.mintDeep }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND.mint }} />
            Live
          </span>
        }
      >
        {loading ? (
          <p className="text-sm py-8 text-center" style={{ color: t.textDim }}>Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: t.textDim }}>
            No WhatsApp activity in the last {windowMinutes} minutes.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: t.border }}>
            {users.map((u, i) => (
              <div key={u.phone + i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(37,211,102,0.12)' }}>
                  <MessageCircle size={15} style={{ color: '#25D366' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: t.text }}>{u.orgName}</p>
                  <p className="text-xs truncate" style={{ color: t.textDim }}>{u.phone} · {u.plan}</p>
                </div>
                <span className="text-xs shrink-0" style={{ color: BRAND.mintDeep }}>{timeAgo(u.lastActiveAt)}</span>
              </div>
            ))}
          </div>
        )}
      </ThemedCard>

      <p className="text-xs mt-4" style={{ color: t.textDim }}>
        This shows WhatsApp bot activity only — every message updates a timestamp we can measure.
        There's no presence/websocket system for the web app yet, so web-tab "online" status isn't tracked.
      </p>
    </div>
  )
}
