// api/flutterwave/webhook/route.ts
// Handles Flutterwave webhook events.
// Verification: compares the verif-hash header to FLW_WEBHOOK_HASH env var
// (set this secret hash in Flutterwave dashboard → Settings → Webhooks).
//
// Handled events:
//   charge.completed      — payment successful, activate plan + log Andrea Aid
//   subscription.cancelled — subscription cancelled

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SELF_SERVE_PLAN_IDS, PLAN_CONFIG, PlanId } from '@/lib/plans'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyTransaction(transactionId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    })
    const json = await res.json()
    return json.status === 'success' ? json.data : null
  } catch {
    return null
  }
}

async function sendAndreaWhatsApp(
  admin: ReturnType<typeof getAdmin>,
  orgId: string,
  planId: string,
  andreaAmount: number,
  lifetimeTotal: number
) {
  try {
    const { data: member } = await admin
      .from('org_members')
      .select('profiles(phone)')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .single()
    const phone = (member as any)?.profiles?.phone
    if (!phone) return

    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER ?? 'whatsapp:+14155238886'
    if (!twilioSid || !twilioToken) return

    const planLabel = PLAN_CONFIG[planId as PlanId]?.label ?? planId
    const fmt = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const body =
      `✅ Payment confirmed!\n\n` +
      `Your ${planLabel} plan is active.\n` +
      `${fmt(andreaAmount)} from this payment goes to Andrea, ` +
      `funding life-saving medical treatments for Nigerians in need.\n\n` +
      `Total contributed to Andrea: ${fmt(lifetimeTotal)}\n` +
      `See patient cases: andreaaid.com/cases`

    const toNumber = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`

    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNumber, To: toNumber, Body: body }).toString(),
      }
    )
  } catch (err) {
    console.error('flutterwave/webhook sendAndreaWhatsApp failed:', err)
  }
}

export async function POST(req: NextRequest) {
  // Verify webhook source — Flutterwave sends a secret hash in the header
  const hash = req.headers.get('verif-hash')
  if (!hash || hash !== process.env.FLW_WEBHOOK_HASH) {
    console.warn('Flutterwave webhook: invalid verif-hash')
    return NextResponse.json({ error: 'Invalid hash' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event as string
  const data = payload.data as Record<string, unknown>

  const admin = getAdmin()
  const meta = data?.meta as Record<string, string> | undefined
  const orgId = meta?.org_id ?? null
  const planId = meta?.plan_id ?? null

  // Log every event and keep the inserted row ID for marking processed
  const { data: loggedEvent } = await admin
    .from('subscription_events')
    .insert({ org_id: orgId, event_type: eventType, payload, processed: false })
    .select('id')
    .single()

  try {
    if (eventType === 'charge.completed') {
      const status = data.status as string
      if (status !== 'successful') {
        return NextResponse.json({ received: true })
      }

      // Verify with Flutterwave API to prevent replay attacks
      const transactionId = data.id as string | number
      const verified = await verifyTransaction(String(transactionId))

      if (!verified || verified.status !== 'successful') {
        console.warn('Flutterwave: transaction verification failed for', transactionId)
        return NextResponse.json({ received: true })
      }

      if (orgId && planId && SELF_SERVE_PLAN_IDS.includes(planId as PlanId)) {
        const config = PLAN_CONFIG[planId as PlanId]
        await admin.from('organizations').update({
          plan: planId,
          paystack_subscription_status: 'active',
          receipt_limit: config.receiptLimit,
          client_limit: config.clientLimit,
        }).eq('id', orgId)

        // Flutterwave sends amount in NGN directly (not kobo)
        const paymentAmount = Number(verified.amount ?? data.amount ?? 0)
        if (paymentAmount > 0) {
          const andreaAmount = Math.round(paymentAmount * 0.02 * 100) / 100
          const now = new Date()

          await admin.from('andrea_contributions').insert({
            org_id: orgId,
            amount: andreaAmount,
            period_month: now.getMonth() + 1,
            period_year: now.getFullYear(),
            subscription_amount: paymentAmount,
          })

          const { data: contribs } = await admin
            .from('andrea_contributions')
            .select('amount')
            .eq('org_id', orgId)
          const lifetimeTotal = (contribs ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)

          await sendAndreaWhatsApp(admin, orgId, planId, andreaAmount, lifetimeTotal)
        }

        // Mark this event as processed using the row ID we captured on insert
        if (loggedEvent?.id) {
          await admin.from('subscription_events').update({ processed: true }).eq('id', loggedEvent.id)
        }
      }
    }

    if (eventType === 'subscription.cancelled') {
      if (orgId) {
        await admin.from('organizations').update({
          paystack_subscription_status: 'cancelled',
        }).eq('id', orgId)

        if (loggedEvent?.id) {
          await admin.from('subscription_events').update({ processed: true }).eq('id', loggedEvent.id)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('flutterwave/webhook processing error:', err)
    return NextResponse.json({ received: true, error: 'Processing failed' })
  }
}
