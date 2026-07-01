// api/paystack/webhook/route.ts
// Handles Paystack webhook events — verifies signature, updates org plan,
// logs all events to subscription_events table.
// PAYSTACK_WEBHOOK_SECRET must match the one set in your Paystack dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Map Paystack plan codes back to our plan IDs
function getPlanIdFromCode(planCode: string | undefined): string | null {
  if (!planCode) return null
  const map: Record<string, string> = {
    [process.env.PAYSTACK_PLAN_INDIVIDUAL  ?? '']: 'individual',
    [process.env.PAYSTACK_PLAN_FAMILY      ?? '']: 'family',
    [process.env.PAYSTACK_PLAN_FREELANCER  ?? '']: 'freelancer',
    [process.env.PAYSTACK_PLAN_SME_STARTER ?? '']: 'sme_starter',
    [process.env.PAYSTACK_PLAN_AGENCY      ?? '']: 'agency',
    [process.env.PAYSTACK_PLAN_SME_PRO     ?? '']: 'sme_pro',
    [process.env.PAYSTACK_PLAN_STUDIO      ?? '']: 'studio',
  }
  return map[planCode] ?? null
}

// Receipt limits per plan — matches organizations.receipt_limit column
const PLAN_RECEIPT_LIMITS: Record<string, number> = {
  free: 10,
  individual: -1,
  family: -1,
  freelancer: -1,
  sme_starter: -1,
  agency: -1,
  sme_pro: -1,
  studio: -1,
  enterprise: -1,
}

// Client limits per plan — matches organizations.client_limit column
const PLAN_CLIENT_LIMITS: Record<string, number> = {
  free: 0,
  individual: 0,
  family: 0,
  freelancer: 10,
  sme_starter: 10,
  agency: 50,
  sme_pro: 50,
  studio: -1,
  enterprise: -1,
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Verify Paystack HMAC-SHA512 signature
  const signature = req.headers.get('x-paystack-signature')
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET

  if (!secret) {
    console.error('PAYSTACK_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const expectedSignature = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex')

  if (signature !== expectedSignature) {
    console.warn('Paystack webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event as string
  const data = payload.data as Record<string, unknown>

  const admin = getAdmin()

  // Log every event regardless of type
  const orgIdFromMeta = (data?.metadata as Record<string, string> | undefined)?.org_id ?? null

  await admin.from('subscription_events').insert({
    org_id: orgIdFromMeta,
    event_type: eventType,
    payload,
    processed: false,
  })

  try {
    if (eventType === 'charge.success') {
      // One-time or first payment of a subscription
      const meta = data.metadata as Record<string, string> | undefined
      const orgId = meta?.org_id
      const planId = meta?.plan_id

      if (orgId && planId) {
        await activatePlan(admin, orgId, planId, data)

        // Log Andrea Aid contribution (2% of subscription amount)
        const paymentAmount = Number((data as any).amount ?? 0) / 100 // Paystack sends amount in kobo
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

          // Calculate lifetime total for WhatsApp message
          const { data: contribs } = await admin
            .from('andrea_contributions')
            .select('amount')
            .eq('org_id', orgId)
          const lifetimeTotal = (contribs ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)

          // Send WhatsApp confirmation with Andrea mention
          await sendAndreaWhatsApp(admin, orgId, planId, andreaAmount, lifetimeTotal)
        }
      }

      // Mark logged event as processed
      await admin
        .from('subscription_events')
        .update({ processed: true })
        .eq('org_id', orgId ?? '')
        .eq('event_type', eventType)
        .order('created_at', { ascending: false })
        .limit(1)
    }

    if (eventType === 'subscription.create') {
      // Recurring subscription activated
      const customer = data.customer as Record<string, unknown> | undefined
      const planCode = (data.plan as Record<string, string> | undefined)?.plan_code
      const subscriptionCode = data.subscription_code as string | undefined
      const orgId = (data.metadata as Record<string, string> | undefined)?.org_id

      const planId = getPlanIdFromCode(planCode)

      if (orgId && planId) {
        await admin.from('organizations').update({
          plan: planId,
          paystack_subscription_id: subscriptionCode,
          paystack_subscription_status: 'active',
          paystack_customer_id: String(customer?.customer_code ?? ''),
          receipt_limit: PLAN_RECEIPT_LIMITS[planId] ?? -1,
          client_limit: PLAN_CLIENT_LIMITS[planId] ?? 0,
        }).eq('id', orgId)
      }
    }

    if (eventType === 'subscription.disable' || eventType === 'subscription.not_renew') {
      // Subscription cancelled or non-renewing
      const orgId = (data.metadata as Record<string, string> | undefined)?.org_id
        ?? await findOrgBySubscriptionCode(admin, data.subscription_code as string)

      if (orgId) {
        await admin.from('organizations').update({
          paystack_subscription_status: eventType === 'subscription.disable' ? 'cancelled' : 'non-renewing',
        }).eq('id', orgId)
      }
    }

    if (eventType === 'invoice.payment_failed') {
      // Payment failed — mark subscription as past due
      const subscriptionCode = (data.subscription as Record<string, string> | undefined)?.subscription_code
      const orgId = subscriptionCode ? await findOrgBySubscriptionCode(admin, subscriptionCode) : null

      if (orgId) {
        await admin.from('organizations').update({
          paystack_subscription_status: 'past_due',
        }).eq('id', orgId)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('paystack/webhook processing error:', err)
    // Return 200 so Paystack doesn't retry — we already logged the event
    return NextResponse.json({ received: true, error: 'Processing failed' })
  }
}

async function activatePlan(
  admin: ReturnType<typeof getAdmin>,
  orgId: string,
  planId: string,
  data: Record<string, unknown>
) {
  const subscriptionCode = data.subscription_code as string | undefined
  const customerCode = (data.customer as Record<string, string> | undefined)?.customer_code

  await admin.from('organizations').update({
    plan: planId,
    paystack_subscription_status: 'active',
    ...(subscriptionCode ? { paystack_subscription_id: subscriptionCode } : {}),
    ...(customerCode ? { paystack_customer_id: customerCode } : {}),
    receipt_limit: PLAN_RECEIPT_LIMITS[planId] ?? -1,
    client_limit: PLAN_CLIENT_LIMITS[planId] ?? 0,
  }).eq('id', orgId)
}

async function findOrgBySubscriptionCode(
  admin: ReturnType<typeof getAdmin>,
  subscriptionCode: string
): Promise<string | null> {
  const { data } = await admin
    .from('organizations')
    .select('id')
    .eq('paystack_subscription_id', subscriptionCode)
    .single()
  return data?.id ?? null
}

const PLAN_LABELS: Record<string, string> = {
  individual: 'Individual', family: 'Family', freelancer: 'Freelancer',
  sme_starter: 'SME Starter', agency: 'Agency', sme_pro: 'SME Pro',
  studio: 'Studio', enterprise: 'Enterprise',
}

async function sendAndreaWhatsApp(
  admin: ReturnType<typeof getAdmin>,
  orgId: string,
  planId: string,
  andreaAmount: number,
  lifetimeTotal: number
) {
  try {
    // Look up the owner's phone number
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

    const planLabel = PLAN_LABELS[planId] ?? planId
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
    console.error('sendAndreaWhatsApp failed:', err)
  }
}
