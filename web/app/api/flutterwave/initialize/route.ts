// api/flutterwave/initialize/route.ts
// Starts a Flutterwave payment for the selected plan.
// Returns { link } — frontend redirects the user to Flutterwave checkout.
//
// Required env vars (NEW — the old FLW_PLAN_FAMILY/FREELANCER/SME_STARTER/
// AGENCY/SME_PRO/STUDIO vars are no longer read; flag to the account owner
// that new recurring "payment plans" need creating in the Flutterwave
// dashboard for Business and Business Pro before these go live — providers
// generally don't let you silently reprice an existing plan ID that has
// active subscribers, so these should be new plan objects, not renamed
// ones):
//   FLW_SECRET_KEY          — from Flutterwave dashboard → Settings → API
//   FLW_PLAN_INDIVIDUAL     — Flutterwave payment plan ID, ₦2,500/mo
//   FLW_PLAN_BUSINESS       — Flutterwave payment plan ID, ₦5,000/mo
//   FLW_PLAN_BUSINESS_PRO   — Flutterwave payment plan ID, ₦10,000/mo
//
// Enterprise is intentionally absent — it is never self-serve checkout,
// only manually assigned via /admin (see app/api/admin/change-plan).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { SELF_SERVE_PLAN_IDS, PLAN_CONFIG as PLANS, PlanId } from '@/lib/plans'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// NGN amounts (not kobo — Flutterwave uses whole numbers)
const FLW_PLAN_IDS: Partial<Record<PlanId, string | undefined>> = {
  individual: process.env.FLW_PLAN_INDIVIDUAL,
  business: process.env.FLW_PLAN_BUSINESS,
  business_pro: process.env.FLW_PLAN_BUSINESS_PRO,
}

export async function POST(req: NextRequest) {
  try {
    const { plan_id } = await req.json() as { plan_id: string }

    if (!plan_id || !SELF_SERVE_PLAN_IDS.includes(plan_id as PlanId)) {
      return NextResponse.json({ error: 'Invalid plan — this plan is not available for self-serve checkout' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // Get user profile for customer name
    const admin = getAdmin()
    const [memberRes, profileRes] = await Promise.all([
      admin.from('org_members').select('org_id, role').eq('user_id', user.id),
      admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ])

    const members = memberRes.data ?? []
    if (members.length === 0) {
      return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
    }

    // Prefer the org this user owns — staff can belong to other orgs too
    const ownRow = members.find(m => m.role === 'owner') ?? members[0]

    const plan = plan_id as PlanId
    const config = { planId: FLW_PLAN_IDS[plan], amount: PLANS[plan].monthlyNgn, label: PLANS[plan].label }
    const orgId = ownRow.org_id
    const customerName = profileRes.data?.full_name ?? user.email ?? 'TrueFlow User'
    const txRef = `TF-${orgId.slice(0, 8)}-${Date.now()}`

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription?upgraded=1&plan=${plan_id}`

    const body: Record<string, unknown> = {
      tx_ref: txRef,
      amount: config.amount,
      currency: 'NGN',
      redirect_url: callbackUrl,
      payment_options: 'card,ussd,banktransfer',
      customer: {
        email: user.email,
        name: customerName,
      },
      customizations: {
        title: 'TrueFlow',
        description: `Upgrade to ${config.label} plan`,
        logo: 'https://app.gettrueflow.com/logo.png',
      },
      meta: {
        org_id: orgId,
        plan_id,
        user_id: user.id,
      },
    }

    // Attach recurring payment plan if configured in Flutterwave dashboard
    if (config.planId) {
      body.payment_plan = config.planId
    }

    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (data.status !== 'success' || !data.data?.link) {
      console.error('Flutterwave initialize failed:', data)
      return NextResponse.json({ error: data.message ?? 'Flutterwave error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      link: data.data.link,
      tx_ref: txRef,
    })
  } catch (err) {
    console.error('flutterwave/initialize error:', err)
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}
