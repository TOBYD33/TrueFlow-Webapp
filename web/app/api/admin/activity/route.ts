// api/admin/activity/route.ts
// Recent platform activity feed for /admin/activity: signups, receipts,
// client payments, subscription events — merged from EXISTING tables
// (business rule: no parallel logging systems). Any admin role can view.

import { NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'

export async function GET() {
  const auth = await requireAdmin(['super', 'support', 'finance', 'readonly'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = getAdminClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [orgsRes, receiptsRes, paymentsRes, subsRes] = await Promise.all([
    admin.from('organizations').select('id, name, plan, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(20),
    admin.from('receipts').select('id, amount, currency, vendor_name, uploaded_via, created_at, organizations(name)').gte('created_at', since).order('created_at', { ascending: false }).limit(25),
    admin.from('client_payments').select('id, amount, currency, created_at, organizations(name)').gte('created_at', since).order('created_at', { ascending: false }).limit(25),
    admin.from('subscription_events').select('id, event_type, created_at, organizations(name)').gte('created_at', since).order('created_at', { ascending: false }).limit(15),
  ])

  const orgName = (row: any) => (Array.isArray(row.organizations) ? row.organizations[0]?.name : row.organizations?.name) ?? 'Unknown org'

  const items = [
    ...(orgsRes.data ?? []).map((o: any) => ({
      type: 'signup', at: o.created_at,
      title: `New signup: ${o.name}`, sub: `${o.plan} plan`,
    })),
    ...(receiptsRes.data ?? []).map((r: any) => ({
      type: 'receipt', at: r.created_at,
      title: `Receipt scanned · ${orgName(r)}`,
      sub: `${r.vendor_name ?? 'Unknown vendor'} · ${r.currency} ${Number(r.amount ?? 0).toLocaleString()} · via ${r.uploaded_via}`,
    })),
    ...(paymentsRes.data ?? []).map((p: any) => ({
      type: 'payment', at: p.created_at,
      title: `Client payment received · ${orgName(p)}`,
      sub: `${p.currency} ${Number(p.amount ?? 0).toLocaleString()}`,
    })),
    ...(subsRes.data ?? []).map((s: any) => ({
      type: 'subscription', at: s.created_at,
      title: `Subscription event · ${orgName(s)}`, sub: s.event_type,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 60)

  return NextResponse.json({ items })
}
