// api/admin/live/route.ts
// "Live now" is measured honestly: WhatsApp sessions with last_active_at
// in the last 5 minutes (a real, measurable signal — every bot message
// updates it). There is no websocket/presence system for the web app, so
// this does NOT claim to show web-tab presence — only WhatsApp activity.
// Polled by the admin page every 20s, not a persistent connection.

import { NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'

const ONLINE_WINDOW_MINUTES = 5

export async function GET() {
  const auth = await requireAdmin(['super', 'support', 'finance', 'readonly'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = getAdminClient()
  const since = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString()

  const { data: sessions } = await admin
    .from('whatsapp_sessions')
    .select('phone_number, last_active_at, organizations(name, plan)')
    .gte('last_active_at', since)
    .order('last_active_at', { ascending: false })
    .limit(50)

  const users = (sessions ?? []).map((s: any) => {
    const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
    return {
      phone: s.phone_number,
      orgName: org?.name ?? 'Unknown org',
      plan: org?.plan ?? 'free',
      lastActiveAt: s.last_active_at,
    }
  })

  return NextResponse.json({ count: users.length, windowMinutes: ONLINE_WINDOW_MINUTES, users })
}
