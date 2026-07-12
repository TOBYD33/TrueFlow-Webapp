// api/auth/whatsapp/send-otp/route.ts
// Generates a 6-digit OTP, stores it in whatsapp_otps, and sends it to the user
// via Twilio WhatsApp. Called from the WhatsApp Sign In section on the login page.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage, normalisePhone } from '@/lib/whatsapp'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json() as { phone: string }
    if (!phone?.trim()) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })
    }

    const normalised = normalisePhone(phone.trim())
    if (!normalised.startsWith('+') || normalised.length < 10) {
      return NextResponse.json(
        { error: 'Enter your number with country code — e.g. +2348012345678' },
        { status: 400 }
      )
    }

    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: dbError } = await getSupabaseAdmin()
      .from('whatsapp_otps')
      .upsert({ phone: normalised, code, expires_at: expiresAt, attempts: 0 })

    if (dbError) {
      console.error('send-otp: db error:', dbError)
      return NextResponse.json({ error: 'Could not generate code. Please try again.' }, { status: 500 })
    }

    const messageBody =
      `Your TrueFlow sign-in code is: *${code}*\n\n` +
      `This code expires in 10 minutes. Do not share it with anyone.\n\n` +
      `— TrueFlow`

    const sent = await sendWhatsAppMessage(normalised, messageBody)
    if (!sent) {
      return NextResponse.json(
        { error: 'Could not send WhatsApp message. Make sure your number has chatted with the TrueFlow bot before.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, phone: normalised })
  } catch (err) {
    console.error('send-otp: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
