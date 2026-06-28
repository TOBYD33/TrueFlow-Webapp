// api/flutterwave/webhook/route.ts
// Handles Flutterwave webhook events.
// Verification: compares the verif-hash header to FLW_WEBHOOK_HASH env var
// (set this secret hash in Flutterwave dashboard → Settings → Webhooks).
//
// Handled events:
//   charge.completed      — payment successful, activate plan
//   subscription.cancelled — subscription cancelled, keep plan until period ends

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PLAN_RECEIPT_LIMITS: Record<string, number> = {
  free: 10, individual: -1, family: -1, freelancer: -1,
  sme_starter: -1, agency: -1, sme_pro: -1, studio: -1, enterprise: -1,
}

const PLAN_CLIENT_LIMITS: Record<string, number> = {
  free: 0, individual: 0, family: 0, freelancer: 10,
  sme_starter: 10, agency: 50, sme_pro: 50, studio: -1, enterprise: -1,
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

  // Log every event
  await admin.from('subscription_events').insert({
    org_id: orgId,
    event_type: eventType,
    payload,
    processed: false,
  })

  try {
    if (eventType === 'charge.completed') {
      const status = data.status as string
      if (status !== 'successful') {
        // Payment not actually successful — ignore
        return NextResponse.json({ received: true })
      }

      // Verify the transaction with Flutterwave to prevent replay attacks
      const transactionId = data.id as string | number
      const verified = await verifyTransaction(String(transactionId))

      if (!verified || verified.status !== 'successful') {
        console.warn('Flutterwave: transaction verification failed for', transactionId)
        return NextResponse.json({ received: true })
      }

      if (orgId && planId && PLAN_RECEIPT_LIMITS[planId] !== undefined) {
        await admin.from('organizations').update({
          plan: planId,
          paystack_subscription_status: 'active', // reuse existing column
          receipt_limit: PLAN_RECEIPT_LIMITS[planId],
          client_limit: PLAN_CLIENT_LIMITS[planId] ?? 0,
        }).eq('id', orgId)

        await admin.from('subscription_events').update({ processed: true })
          .eq('org_id', orgId).eq('event_type', eventType)
          .order('created_at', { ascending: false }).limit(1)
      }
    }

    if (eventType === 'subscription.cancelled') {
      if (orgId) {
        await admin.from('organizations').update({
          paystack_subscription_status: 'cancelled',
        }).eq('id', orgId)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('flutterwave/webhook processing error:', err)
    // Return 200 so Flutterwave doesn't retry — event is already logged
    return NextResponse.json({ received: true, error: 'Processing failed' })
  }
}
