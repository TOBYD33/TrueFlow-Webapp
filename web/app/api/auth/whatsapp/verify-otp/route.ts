// api/auth/whatsapp/verify-otp/route.ts
// Verifies the 6-digit OTP, finds or creates a Supabase auth user for the phone number,
// generates a magic link, and returns the action_link for the client to redirect to.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.gettrueflow.com'
const CALLBACK_URL = `${APP_URL}/auth/callback`

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json() as { phone: string; code: string }

    if (!phone || !code) {
      return NextResponse.json({ error: 'Phone and code are required.' }, { status: 400 })
    }

    // Load stored OTP
    const { data: otp, error: otpError } = await supabaseAdmin
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phone)
      .single()

    if (otpError || !otp) {
      return NextResponse.json({ error: 'No code found. Please request a new one.' }, { status: 400 })
    }

    if (new Date(otp.expires_at) < new Date()) {
      await getSupabaseAdmin().from('whatsapp_otps').delete().eq('phone', phone)
      return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 })
    }

    if (otp.attempts >= 5) {
      return NextResponse.json({ error: 'Too many attempts. Please request a new code.' }, { status: 429 })
    }

    // Increment attempts before verifying
    await supabaseAdmin
      .from('whatsapp_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('phone', phone)

    if (otp.code !== code.trim()) {
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
    }

    // Code correct — consume it
    await getSupabaseAdmin().from('whatsapp_otps').delete().eq('phone', phone)

    // Find profile by phone number
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone')
      .eq('phone', phone)
      .single()

    // Derive a stable email from phone (used for WhatsApp-only users)
    const sanitizedPhone = phone.replace(/[^0-9]/g, '')
    const derivedEmail = `wa_${sanitizedPhone}@trueflow.app`

    let authEmail = derivedEmail
    let isNewUser = true

    if (profile) {
      // Check if profile.id exists in auth.users
      const { data: { user: existingAuthUser } } = await getSupabaseAdmin().auth.admin.getUserById(profile.id)

      if (existingAuthUser?.email) {
        // User already has a full web account — use their real email
        authEmail = existingAuthUser.email
        isNewUser = false
      }
    }

    if (isNewUser) {
      // Create Supabase auth account for this WhatsApp user
      const { data: { user: newUser }, error: createError } = await getSupabaseAdmin().auth.admin.createUser({
        email: derivedEmail,
        email_confirm: true,
        user_metadata: {
          phone,
          full_name: profile?.full_name || '',
          source: 'whatsapp_signin'
        }
      })

      // Ignore "already registered" errors — user may have signed in this way before
      if (createError && !createError.message.toLowerCase().includes('already')) {
        console.error('verify-otp: createUser failed:', createError)
        return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
      }

      // If a new auth user was created, link them to the existing org
      if (newUser && profile) {
        await supabaseAdmin
          .from('org_members')
          .update({ user_id: newUser.id })
          .eq('user_id', profile.id)

        await supabaseAdmin
          .from('whatsapp_sessions')
          .update({ user_id: newUser.id })
          .eq('user_id', profile.id)
      }
    }

    // Generate a one-time magic link for immediate sign-in
    const { data: linkData, error: linkError } = await getSupabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: CALLBACK_URL }
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('verify-otp: generateLink failed:', linkError)
      return NextResponse.json({ error: 'Could not create sign-in link. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      redirect: linkData.properties.action_link,
      isNewUser,
      name: profile?.full_name || null
    })
  } catch (err) {
    console.error('verify-otp: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
