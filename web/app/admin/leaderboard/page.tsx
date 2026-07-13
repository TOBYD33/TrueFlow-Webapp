'use client'
// app/admin/leaderboard/page.tsx
// Most Active Users + Most Active Admins, last 30 days, concept-styled.

import { useEffect, useState } from 'react'
import { ThemedCard, PageHeader } from '@/components/shared/Cards'
import { useTheme, tone, BRAND } from '@/components/shared/theme'

interface UserRow { name: string; plan: string; receipts: number; score: number }
interface AdminRow { name: string; role: string; count: number }

export default function AdminLeaderboardPage() {
  const { dark } = useTheme()
  const t = tone(dark)
  const [users, setUsers] = useState<UserRow[]>([])
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/leaderboard')
      .then(r => r.json())
      .then(json => { setUsers(json.users ?? []); setAdmins(json.admins ?? []) })
      .finally(() => setLoading(false))
  }, [])

  const rankColor = (i: number) => (i === 0 ? '#D9932A' : i === 1 ? '#8E8E93' : i === 2 ? '#B57A1E' : t.textDim)

  return (
    <div className="max-w-4xl">
      <PageHeader title="Leaderboard" subtitle="Activity over the last 30 days" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ThemedCard title="Most Active Users">
          {loading ? (
            <p className="text-sm py-6 text-center" style={{ color: t.textDim }}>Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: t.textDim }}>No user activity yet.</p>
          ) : (
            <div className="space-y-2.5">
              {users.map((u, i) => (
                <div key={u.name + i} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: t.border }}>
                  <span className="w-7 text-center font-bold text-sm" style={{ color: rankColor(i) }}>#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{u.name}</p>
                    <p className="text-xs capitalize" style={{ color: t.textDim }}>{u.plan.replace('_', ' ')} plan · {u.receipts} receipts</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: BRAND.violet }}>{u.score}</span>
                </div>
              ))}
            </div>
          )}
        </ThemedCard>

        <ThemedCard title="Most Active Admins">
          {loading ? (
            <p className="text-sm py-6 text-center" style={{ color: t.textDim }}>Loading…</p>
          ) : admins.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: t.textDim }}>No admin actions in the last 30 days.</p>
          ) : (
            <div className="space-y-2.5">
              {admins.map((a, i) => (
                <div key={a.name + i} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: t.border }}>
                  <span className="w-7 text-center font-bold text-sm" style={{ color: rankColor(i) }}>#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{a.name}</p>
                    <p className="text-xs capitalize" style={{ color: t.textDim }}>{a.role} admin</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: BRAND.mintDeep }}>{a.count} actions</span>
                </div>
              ))}
            </div>
          )}
        </ThemedCard>
      </div>
    </div>
  )
}
