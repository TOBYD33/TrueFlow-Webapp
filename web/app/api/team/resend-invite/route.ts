// api/team/resend-invite/route.ts
// Resets the invite expiry and re-sends the invite message/email.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()

  const { data: caller } = await admin
    .from('org_members').select('org_id, role').eq('user_id', user.id).is('removed_at', null).single()

  if (!caller || !['owner', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { inviteId } = await req.json()
  if (!inviteId) return NextResponse.json({ error: 'inviteId required' }, { status: 400 })

  const { data: invite } = await admin
    .from('org_members')
    .select('org_id, role, invited_email, whatsapp_number, invite_token')
    .eq('id', inviteId)
    .not('invite_token', 'is', null)
    .single()

  if (!invite || invite.org_id !== caller.org_id) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  const newToken = randomUUID()
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin
    .from('org_members')
    .update({ invite_token: newToken, invite_expires_at: newExpiry })
    .eq('id', inviteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const acceptLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.trueflio.com'}/invite/accept/${newToken}`

  // Re-send WhatsApp if phone invite
  if (invite.whatsapp_number && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const auth = process.env.TWILIO_AUTH_TOKEN
    const form = new URLSearchParams({
      From: process.env.TWILIO_WHATSAPP_NUMBER!,
      To: `whatsapp:${invite.whatsapp_number}`,
      Body: `📨 Your TrueFlio team invite has been renewed.\n\nAccept here: ${acceptLink}\n\nOr reply *START* to begin.`,
    })
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }).catch(err => console.error('Resend WhatsApp failed:', err))
  }

  if (invite.invited_email && process.env.RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TrueFlio <hello@trueflio.com>',
        to: [invite.invited_email],
        subject: 'Your TrueFlio team invite has been renewed',
        html: `<p>Your invitation to join a TrueFlio workspace has been renewed.</p><p><a href="${acceptLink}" style="background:#6C63FF;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Accept Invitation</a></p><p>This link expires in 7 days.</p>`,
      }),
    }).catch(err => console.error('Resend email failed:', err))
  }

  return NextResponse.json({ ok: true })
}
