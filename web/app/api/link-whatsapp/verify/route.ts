// api/link-whatsapp/verify/route.ts
// Verifies the WhatsApp link code and performs the merge via the shared
// perform_identity_merge Postgres function (single implementation used by
// both the bot and the web). 3 attempts, graceful failure, no lockout.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MAX_ATTEMPTS = 3

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json() as { code: string }
    if (!code?.trim()) return NextResponse.json({ error: 'Enter the code.' }, { status: 400 })

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()

    // Latest live code this user requested via WhatsApp channel
    const { data: codeRow } = await admin
      .from('identity_merge_codes')
      .select('id, code, target_profile_id, expires_at, used_at, attempts')
      .eq('requested_by_profile_id', user.id)
      .eq('channel', 'whatsapp')
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!codeRow || new Date(codeRow.expires_at) <= new Date()) {
      return NextResponse.json({ error: 'That code has expired. Request a new one.', ended: true }, { status: 400 })
    }

    if ((codeRow.attempts ?? 0) >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "That didn't match. You can try again later.", ended: true }, { status: 400 })
    }

    if (codeRow.code !== code.trim()) {
      const attempts = (codeRow.attempts ?? 0) + 1
      await admin.from('identity_merge_codes').update({ attempts }).eq('id', codeRow.id)
      if (attempts >= MAX_ATTEMPTS) {
        return NextResponse.json({ error: "That didn't match. You can try again later — no lockout, just start over when ready.", ended: true }, { status: 400 })
      }
      return NextResponse.json({ error: `That code didn't match. ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left.` }, { status: 400 })
    }

    // Verified — mark used and run the SHARED merge function
    await admin.from('identity_merge_codes').update({ used_at: new Date().toISOString() }).eq('id', codeRow.id)

    const { data: primaryId, error: mergeErr } = await admin
      .rpc('perform_identity_merge', { profile_a: user.id, profile_b: codeRow.target_profile_id })

    if (mergeErr) {
      console.error('link-whatsapp/verify: merge failed:', mergeErr)
      return NextResponse.json({ error: 'Verification worked but the merge failed. Contact support@gettrueflow.com.' }, { status: 500 })
    }

    // Safety net: a stale/incomplete version of perform_identity_merge was
    // found to reassign profiles and whatsapp_sessions correctly but skip
    // org_members entirely, silently stranding the merged-away user's org
    // data behind an identity nothing resolves to anymore. Verify and
    // self-heal here too, independent of whether the RPC's SQL is fixed.
    const secondaryId = primaryId === user.id ? codeRow.target_profile_id : user.id
    const { data: stranded } = await admin
      .from('org_members')
      .select('id, org_id')
      .eq('user_id', secondaryId)
    for (const m of stranded ?? []) {
      const { data: existing } = await admin
        .from('org_members')
        .select('id')
        .eq('org_id', m.org_id)
        .eq('user_id', primaryId as string)
        .maybeSingle()
      if (existing) {
        await admin.from('org_members').update({ removed_at: new Date().toISOString() }).eq('id', m.id)
      } else {
        const { error } = await admin.from('org_members').update({ user_id: primaryId as string }).eq('id', m.id)
        if (error) console.error('link-whatsapp/verify: org_members reassign failed:', error)
      }
    }

    // Confirm on WhatsApp (the claimed channel) — best-effort
    const { data: waProfile } = await admin
      .from('profiles').select('phone').eq('id', codeRow.target_profile_id).maybeSingle()
    const { data: primaryProfile } = await admin
      .from('profiles').select('phone').eq('id', primaryId as string).maybeSingle()
    const confirmPhone = primaryProfile?.phone ?? waProfile?.phone
    if (confirmPhone) {
      sendWhatsAppMessage(
        confirmPhone,
        '✅ Your accounts are linked! You can now log in on web with this number\'s OTP or your email.'
      ).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('link-whatsapp/verify error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
