// api/admin/leaderboard/route.ts
// Most Active Users (receipts + login recency, 30 days) and Most Active
// Admins (admin_audit_log entries, 30 days). Any admin role can view.

import { NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'

export async function GET() {
  const auth = await requireAdmin(['super', 'support', 'finance', 'readonly'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = getAdminClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [receiptsRes, sessionsRes, orgsRes, auditRes] = await Promise.all([
    admin.from('receipts').select('org_id').gte('created_at', since),
    admin.from('whatsapp_sessions').select('org_id, last_active_at').gte('last_active_at', since),
    admin.from('organizations').select('id, name, plan'),
    admin.from('admin_audit_log').select('admin_id, profiles!admin_id(full_name, admin_role, is_super_admin)').gte('created_at', since),
  ])

  // Users panel: receipt count + login (bot activity) frequency per org
  const receiptCounts = new Map<string, number>()
  for (const r of (receiptsRes.data ?? []) as any[]) {
    receiptCounts.set(r.org_id, (receiptCounts.get(r.org_id) ?? 0) + 1)
  }
  const activeOrgs = new Set(((sessionsRes.data ?? []) as any[]).map(s => s.org_id))

  const users = ((orgsRes.data ?? []) as any[])
    .map(o => {
      const receipts = receiptCounts.get(o.id) ?? 0
      const loginBonus = activeOrgs.has(o.id) ? 5 : 0
      return { name: o.name, plan: o.plan, receipts, score: receipts + loginBonus }
    })
    .filter(u => u.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  // Admins panel: audit entries per admin
  const adminCounts = new Map<string, { name: string; role: string; count: number }>()
  for (const e of (auditRes.data ?? []) as any[]) {
    const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles
    const existing = adminCounts.get(e.admin_id)
    if (existing) existing.count++
    else adminCounts.set(e.admin_id, {
      name: p?.full_name ?? 'Admin',
      role: p?.admin_role ?? (p?.is_super_admin ? 'super' : 'admin'),
      count: 1,
    })
  }
  const admins = [...adminCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10)

  return NextResponse.json({ users, admins })
}
