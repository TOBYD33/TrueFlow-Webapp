// api/link-whatsapp/start/route.ts
// Flow 2 of the Cross-Channel Identity Merge: a web (Gmail) user claims a
// WhatsApp number. Verifies the number belongs to an existing WhatsApp
// account, then sends a 6-digit code TO that number via the WhatsApp bot
// number (never SMS). Code stored in identity_merge_codes, 10 min expiry.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage, normalisePhone } from '@/lib/whatsapp'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json() as { phone: string }
    if (!phone?.trim()) return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const normalised = normalisePhone(phone.trim())
    if (!normalised.startsWith('+') || normalised.length < 10) {
      return NextResponse.json({ error: 'Enter the number with country code — e.g. +2348012345678' }, { status: 400 })
    }

    const admin = getAdmin()

    // Does a WhatsApp account exist with this number? Check profiles first,
    // then whatsapp_sessions, then org_members (spec: org_members or profiles).
    let targetProfileId: string | null = null

    const { data: phoneProfile } = await admin
      .from('profiles').select('id, status').eq('phone', normalised).maybeSingle()
    if (phoneProfile && phoneProfile.status !== 'merged') targetProfileId = phoneProfile.id

    if (!targetProfileId) {
      const { data: waSession } = await admin
        .from('whatsapp_sessions').select('user_id').eq('phone_number', normalised).maybeSingle()
      targetProfileId = waSession?.user_id ?? null
    }

    if (!targetProfileId) {
      const { data: member } = await admin
        .from('org_members').select('user_id').eq('whatsapp_number', normalised).is('removed_at', null).limit(1).maybeSingle()
      targetProfileId = member?.user_id ?? null
    }

    if (!targetProfileId || targetProfileId === user.id) {
      return NextResponse.json({
        found: false,
        message: 'No WhatsApp account found with that number yet. Message us on WhatsApp to get started there, then come back to link it.',
      })
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const { error: codeErr } = await admin.from('identity_merge_codes').insert({
      target_profile_id: targetProfileId,
      code,
      channel: 'whatsapp',
      requested_by_profile_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (codeErr) {
      console.error('link-whatsapp/start: code insert failed:', codeErr)
      return NextResponse.json({ error: 'Could not start the link. Please try again.' }, { status: 500 })
    }

    const sent = await sendWhatsAppMessage(
      normalised,
      `Your TrueFlow account link code is: *${code}*\n\nSomeone (hopefully you) asked to link this WhatsApp account with a web account. This code expires in 10 minutes. If this wasn't you, ignore this message — nothing changes without the code.\n\n— TrueFlow`
    )
    if (!sent) {
      return NextResponse.json({ error: 'Could not send the code on WhatsApp right now. Please try again later.' }, { status: 502 })
    }

    return NextResponse.json({ found: true })
  } catch (err) {
    console.error('link-whatsapp/start error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
