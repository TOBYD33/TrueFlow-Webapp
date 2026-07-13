// api/admin/broadcast/route.ts
// Broadcast tool — SUPER ADMIN ONLY (business rule 5).
// GET ?mode=preview&...filter  → exact recipient count
// POST { message, filter, channel, confirmation } → send + log
//
// Uses the EXISTING sending infrastructure only: lib/whatsapp.ts (Twilio
// WhatsApp) and Resend for email. >50 recipients requires typed "Send"
// (enforced server-side too). Logs every broadcast to admin_broadcasts.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const MAX_RECIPIENTS = 500 // hard safety cap
const TYPED_CONFIRM_THRESHOLD = 50

interface AudienceFilter {
  audience: 'all' | 'plan' | 'inactive' | 'country'
  plan?: string
  country?: string
}

interface Recipient {
  orgId: string
  orgName: string
  userId: string | null
  phone: string | null
  email: string | null
}

async function resolveRecipients(filter: AudienceFilter): Promise<Recipient[]> {
  const admin = getAdminClient()

  let orgQuery = admin
    .from('organizations')
    .select('id, name, plan, default_tax_country, owner_id')
    .neq('status', 'suspended')
    .limit(MAX_RECIPIENTS)

  if (filter.audience === 'plan' && filter.plan) orgQuery = orgQuery.eq('plan', filter.plan)
  if (filter.audience === 'country' && filter.country) orgQuery = orgQuery.eq('default_tax_country', filter.country)

  const { data: orgs } = await orgQuery
  let orgList = (orgs ?? []) as { id: string; name: string; owner_id: string | null }[]

  // Inactive 30+ days: no receipt created in the last 30 days
  if (filter.audience === 'inactive') {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: activeOrgs } = await admin
      .from('receipts')
      .select('org_id')
      .gte('created_at', cutoff)
    const activeSet = new Set((activeOrgs ?? []).map((r: any) => r.org_id))
    orgList = orgList.filter(o => !activeSet.has(o.id))
  }

  const recipients: Recipient[] = []
  for (const org of orgList) {
    // Owner membership → phone; email via Supabase Auth
    const { data: owner } = await admin
      .from('org_members')
      .select('user_id, whatsapp_number, profiles(phone)')
      .eq('org_id', org.id)
      .eq('role', 'owner')
      .is('removed_at', null)
      .limit(1)
      .maybeSingle()

    const profile: any = Array.isArray(owner?.profiles) ? owner?.profiles[0] : owner?.profiles
    const phone = owner?.whatsapp_number ?? profile?.phone ?? null

    let email: string | null = null
    const userId = owner?.user_id ?? org.owner_id
    if (userId) {
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      const e = authUser?.user?.email ?? null
      // Skip derived placeholder emails for WhatsApp-only users
      email = e && !e.endsWith('@trueflow.app') ? e : null
    }

    if (phone || email) recipients.push({ orgId: org.id, orgName: org.name, userId: userId ?? null, phone, email })
  }
  return recipients
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const p = req.nextUrl.searchParams
  const filter: AudienceFilter = {
    audience: (p.get('audience') as AudienceFilter['audience']) ?? 'all',
    plan: p.get('plan') ?? undefined,
    country: p.get('country') ?? undefined,
  }
  const recipients = await resolveRecipients(filter)
  return NextResponse.json({
    count: recipients.length,
    withWhatsApp: recipients.filter(r => r.phone).length,
    withEmail: recipients.filter(r => r.email).length,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { message, filter, channel, confirmation } = await req.json() as {
    message: string
    filter: AudienceFilter
    channel: 'whatsapp' | 'email' | 'both'
    confirmation?: string
  }

  if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  if (!['whatsapp', 'email', 'both'].includes(channel)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })

  const recipients = await resolveRecipients(filter ?? { audience: 'all' })
  if (recipients.length === 0) return NextResponse.json({ error: 'No recipients match this filter' }, { status: 400 })

  // Typed "Send" required over the threshold — enforced server-side
  if (recipients.length > TYPED_CONFIRM_THRESHOLD && confirmation !== 'Send') {
    return NextResponse.json(
      { error: `This broadcast reaches ${recipients.length} recipients. Type "Send" to confirm.`, requiresConfirmation: true },
      { status: 400 }
    )
  }

  let sentWhatsApp = 0
  let sentEmail = 0

  for (const r of recipients) {
    if ((channel === 'whatsapp' || channel === 'both') && r.phone) {
      const ok = await sendWhatsAppMessage(r.phone, `📢 *TrueFlow announcement*\n\n${message}`)
      if (ok) sentWhatsApp++
    }
    if ((channel === 'email' || channel === 'both') && r.email && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'TrueFlow <hello@verify.gettrueflow.com>',
            to: r.email,
            subject: 'TrueFlow announcement',
            html: `<p>${message.replace(/\n/g, '<br/>')}</p><p style="color:#888;font-size:12px">— The TrueFlow team</p>`,
          }),
        })
        if (res.ok) sentEmail++
      } catch { /* continue with the rest */ }
    }
  }

  const admin = getAdminClient()
  await admin.from('admin_broadcasts').insert({
    sent_by_admin_id: auth.userId,
    message,
    audience_filter: filter ?? { audience: 'all' },
    channel,
    recipient_count: recipients.length,
  })

  await logAdminAction({
    adminId: auth.userId,
    action: 'send_broadcast',
    targetTable: 'admin_broadcasts',
    details: { channel, recipient_count: recipients.length, sent_whatsapp: sentWhatsApp, sent_email: sentEmail, filter },
  })

  return NextResponse.json({ success: true, recipients: recipients.length, sentWhatsApp, sentEmail })
}
