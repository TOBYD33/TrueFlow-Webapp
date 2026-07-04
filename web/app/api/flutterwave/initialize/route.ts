// api/flutterwave/initialize/route.ts
// Starts a Flutterwave payment for the selected plan.
// Returns { link } — frontend redirects the user to Flutterwave checkout.
//
// Required env vars:
//   FLW_SECRET_KEY          — from Flutterwave dashboard → Settings → API
//   FLW_PLAN_INDIVIDUAL     — Flutterwave payment plan ID for each tier
//   FLW_PLAN_FAMILY         — (create plans in Flutterwave dashboard first)
//   FLW_PLAN_FREELANCER
//   FLW_PLAN_SME_STARTER
//   FLW_PLAN_AGENCY
//   FLW_PLAN_SME_PRO
//   FLW_PLAN_STUDIO

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

// NGN amounts (not kobo — Flutterwave uses whole numbers)
const PLAN_CONFIG: Record<string, { planId?: string; amount: number; label: string }> = {
  individual:  { planId: process.env.FLW_PLAN_INDIVIDUAL,  amount: 2500,  label: 'Individual'  },
  family:      { planId: process.env.FLW_PLAN_FAMILY,      amount: 5000,  label: 'Family'      },
  freelancer:  { planId: process.env.FLW_PLAN_FREELANCER,  amount: 5000,  label: 'Freelancer'  },
  sme_starter: { planId: process.env.FLW_PLAN_SME_STARTER, amount: 7500,  label: 'SME Starter' },
  agency:      { planId: process.env.FLW_PLAN_AGENCY,      amount: 12000, label: 'Agency'      },
  sme_pro:     { planId: process.env.FLW_PLAN_SME_PRO,     amount: 15000, label: 'SME Pro'     },
  studio:      { planId: process.env.FLW_PLAN_STUDIO,      amount: 25000, label: 'Studio'      },
}

export async function POST(req: NextRequest) {
  try {
    const { plan_id } = await req.json() as { plan_id: string }

    if (!plan_id || !PLAN_CONFIG[plan_id]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
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

    const config = PLAN_CONFIG[plan_id]
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
