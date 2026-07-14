// api/auth/whatsapp/magic-login/route.ts
// Consumes the one-time magic-link token sent at the end of onboarding
// (app.gettrueflow.com/login?token=xyz123, 15 min expiry). Bot-created
// profiles have NO matching auth.users row until a web login actually
// creates one — resolveOrCreateAuthUserForProfile handles that exactly
// like the WhatsApp OTP flow does, so the two never diverge. Same
// generateLink -> token_hash -> client-side verifyOtp pattern as OTP login.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrCreateAuthUserForProfile } from '@/lib/whatsapp-identity'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json() as { token: string }
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const admin = getSupabaseAdmin()

    const { data: row } = await admin
      .from('magic_login_tokens')
      .select('user_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (!row) {
      return NextResponse.json(
        { error: 'This link is invalid. Use app.gettrueflow.com/login to sign in with a WhatsApp code instead.' },
        { status: 404 }
      )
    }
    if (row.used_at) {
      return NextResponse.json(
        { error: 'This link has already been used. Use app.gettrueflow.com/login to sign in with a WhatsApp code instead.' },
        { status: 410 }
      )
    }
    if (new Date(row.expires_at) <= new Date()) {
      return NextResponse.json(
        { error: 'This link has expired. Use app.gettrueflow.com/login to sign in with a WhatsApp code instead.' },
        { status: 410 }
      )
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('phone, full_name')
      .eq('id', row.user_id)
      .maybeSingle()

    const { email } = await resolveOrCreateAuthUserForProfile(
      row.user_id,
      profile?.phone ?? null,
      profile?.full_name ?? null
    )

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('magic-login: generateLink failed:', linkError)
      return NextResponse.json({ error: 'Could not create a sign-in session. Please try again.' }, { status: 500 })
    }

    await admin.from('magic_login_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)

    return NextResponse.json({ success: true, token_hash: linkData.properties.hashed_token })
  } catch (err) {
    console.error('magic-login error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
