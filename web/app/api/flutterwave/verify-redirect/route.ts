// api/flutterwave/verify-redirect/route.ts
// Called when the user returns from Flutterwave checkout.
// Verifies the transaction directly with Flutterwave API and upgrades the plan.
// This is the primary plan-activation path — webhooks are a secondary backup.

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

const PLAN_RECEIPT_LIMITS: Record<string, number> = {
  free: 10, individual: -1, family: -1, freelancer: -1,
  sme_starter: -1, agency: -1, sme_pro: -1, studio: -1, enterprise: -1,
}

const PLAN_CLIENT_LIMITS: Record<string, number> = {
  free: 0, individual: 0, family: 0, freelancer: 10,
  sme_starter: 10, agency: 50, sme_pro: 50, studio: -1, enterprise: -1,
}

// NGN price per plan — payment must match or exceed this to activate
const PLAN_PRICES: Record<string, number> = {
  individual: 2500, family: 5000, freelancer: 5000,
  sme_starter: 7500, agency: 12000, sme_pro: 15000, studio: 25000,
}

export async function POST(req: NextRequest) {
  try {
    const { transaction_id, plan_id } = await req.json() as {
      transaction_id: string
      plan_id: string
    }

    if (!transaction_id || !plan_id) {
      return NextResponse.json({ error: 'Missing transaction_id or plan_id' }, { status: 400 })
    }

    if (PLAN_RECEIPT_LIMITS[plan_id] === undefined) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // Require an authenticated session
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // Verify the transaction with Flutterwave
    const flwRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
    )
    const flwJson = await flwRes.json()

    if (flwJson.status !== 'success' || flwJson.data?.status !== 'successful') {
      console.error('verify-redirect: FLW verification failed', flwJson)
      return NextResponse.json({ error: 'Transaction not verified' }, { status: 400 })
    }

    const txData = flwJson.data as Record<string, unknown>

    // The paid amount must cover the requested plan's price
    const paidAmount = Number(txData.amount ?? 0)
    const requiredAmount = PLAN_PRICES[plan_id]
    if (!requiredAmount || paidAmount < requiredAmount) {
      console.error(
        `verify-redirect: amount mismatch — paid ${paidAmount}, plan ${plan_id} requires ${requiredAmount}`
      )
      return NextResponse.json({ error: 'Payment amount does not match plan' }, { status: 400 })
    }

    // Look up the org from the authenticated user.
    // Prefer the org where this user is the owner (a user can be staff elsewhere).
    const admin = getAdmin()
    const { data: members } = await admin
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)

    if (!members || members.length === 0) {
      return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
    }

    const ownRow = members.find(m => m.role === 'owner') ?? members[0]
    const orgId = ownRow.org_id

    // Cross-check against the org embedded in the transaction's tx_ref (TF-{org8}-{ts})
    const txRef = String(txData.tx_ref ?? '')
    const refOrgPrefix = txRef.startsWith('TF-') ? txRef.split('-')[1] : null
    if (refOrgPrefix && !String(orgId).startsWith(refOrgPrefix)) {
      const refMatch = members.find(m => String(m.org_id).startsWith(refOrgPrefix))
      if (refMatch) {
        // The payment was initiated for another org this user belongs to — use that one
        return activatePlan(admin, refMatch.org_id, plan_id, txData, transaction_id)
      }
      console.warn(`verify-redirect: tx_ref org ${refOrgPrefix} does not match user orgs`)
      return NextResponse.json({ error: 'Transaction does not belong to your organisation' }, { status: 403 })
    }

    return activatePlan(admin, orgId, plan_id, txData, transaction_id)
  } catch (err) {
    console.error('flutterwave/verify-redirect error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

async function activatePlan(
  admin: ReturnType<typeof getAdmin>,
  orgId: string,
  plan_id: string,
  txData: Record<string, unknown>,
  transaction_id: string
) {
  // Guard against double-processing the same transaction
  const txId = String(txData.id ?? transaction_id)
  const { data: already } = await admin
    .from('subscription_events')
    .select('id')
    .eq('org_id', orgId)
    .eq('event_type', 'charge.completed')
    .contains('payload', { _tx_id: txId })
    .maybeSingle()

  if (already) {
    // Already activated — return the current plan
    const { data: org } = await admin
      .from('organizations')
      .select('plan')
      .eq('id', orgId)
      .single()
    return NextResponse.json({ success: true, plan: org?.plan ?? plan_id })
  }

  // Activate the new plan
  const { error: updateError } = await admin.from('organizations').update({
    plan: plan_id,
    paystack_subscription_status: 'active',
    receipt_limit: PLAN_RECEIPT_LIMITS[plan_id],
    client_limit: PLAN_CLIENT_LIMITS[plan_id] ?? 0,
  }).eq('id', orgId)

  if (updateError) {
    console.error('verify-redirect: organizations update failed:', updateError)
    return NextResponse.json({ error: 'Plan update failed', detail: updateError.message }, { status: 500 })
  }

  // Log the event (best-effort — don't fail the request if this errors)
  await admin.from('subscription_events').insert({
    org_id: orgId,
    event_type: 'charge.completed',
    payload: { ...txData, _tx_id: txId },
    processed: true,
  }).then(({ error: evtErr }) => {
    if (evtErr) console.error('verify-redirect: subscription_events insert failed:', evtErr)
  })

  // Log Andrea Aid contribution (2% of payment)
  const paymentAmount = Number(txData.amount ?? 0)
  if (paymentAmount > 0) {
    const andreaAmount = Math.round(paymentAmount * 0.02 * 100) / 100
    const now = new Date()
    await admin.from('andrea_contributions').insert({
      org_id: orgId,
      amount: andreaAmount,
      period_month: now.getMonth() + 1,
      period_year: now.getFullYear(),
      subscription_amount: paymentAmount,
    }).then(({ error }) => {
      if (error) console.error('verify-redirect: andrea_contributions insert failed:', error)
    })
  }

  return NextResponse.json({ success: true, plan: plan_id })
}
