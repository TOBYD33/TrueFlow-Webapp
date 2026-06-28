// api/whatsapp/link-phone/route.ts
// Verifies OTP and links the phone number to the currently signed-in user's account.
// Updates profiles.phone, org_members.whatsapp_number, and whatsapp_sessions.user_id.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json() as { phone: string; code: string }
    if (!phone || !code) {
      return NextResponse.json({ error: 'Phone and code are required.' }, { status: 400 })
    }

    // Get the currently logged-in user
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const admin = getAdmin()

    // Verify OTP
    const { data: otp, error: otpError } = await admin
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phone)
      .single()

    if (otpError || !otp) {
      return NextResponse.json({ error: 'No code found. Please request a new one.' }, { status: 400 })
    }
    if (new Date(otp.expires_at) < new Date()) {
      await admin.from('whatsapp_otps').delete().eq('phone', phone)
      return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 })
    }
    if (otp.attempts >= 5) {
      return NextResponse.json({ error: 'Too many attempts. Please request a new code.' }, { status: 429 })
    }
    await admin.from('whatsapp_otps').update({ attempts: otp.attempts + 1 }).eq('phone', phone)
    if (otp.code !== code.trim()) {
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
    }

    // Consume OTP
    await admin.from('whatsapp_otps').delete().eq('phone', phone)

    // Link phone to this user's profile
    await admin.from('profiles').update({ phone }).eq('id', user.id)

    // Update org_members with whatsapp_number
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (member) {
      await admin
        .from('org_members')
        .update({ whatsapp_number: phone })
        .eq('user_id', user.id)

      // Link any existing whatsapp_session for this phone to this user
      await admin
        .from('whatsapp_sessions')
        .upsert({
          phone_number: phone,
          user_id: user.id,
          org_id: member.org_id,
          last_active_at: new Date().toISOString(),
        }, { onConflict: 'phone_number' })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('link-phone: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
