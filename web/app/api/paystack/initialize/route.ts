// api/paystack/initialize/route.ts
// Starts a Paystack subscription checkout for the selected plan.
// Returns { authorization_url } — frontend redirects the user there.
//
// Paystack plan codes must be created in your Paystack dashboard first,
// then set as env vars. Each plan code maps to a recurring subscription.

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

// Map plan IDs to Paystack plan codes and amounts (kobo)
const PLAN_CONFIG: Record<string, { planCode?: string; amount: number; label: string }> = {
  individual:  { planCode: process.env.PAYSTACK_PLAN_INDIVIDUAL,  amount: 250000,  label: 'Individual'  },
  family:      { planCode: process.env.PAYSTACK_PLAN_FAMILY,      amount: 500000,  label: 'Family'      },
  freelancer:  { planCode: process.env.PAYSTACK_PLAN_FREELANCER,  amount: 500000,  label: 'Freelancer'  },
  sme_starter: { planCode: process.env.PAYSTACK_PLAN_SME_STARTER, amount: 750000,  label: 'SME Starter' },
  agency:      { planCode: process.env.PAYSTACK_PLAN_AGENCY,      amount: 1200000, label: 'Agency'      },
  sme_pro:     { planCode: process.env.PAYSTACK_PLAN_SME_PRO,     amount: 1500000, label: 'SME Pro'     },
  studio:      { planCode: process.env.PAYSTACK_PLAN_STUDIO,      amount: 2500000, label: 'Studio'      },
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

    const admin = getAdmin()
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })

    const config = PLAN_CONFIG[plan_id]
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription?upgraded=1&plan=${plan_id}`

    const body: Record<string, unknown> = {
      email: user.email,
      amount: config.amount,
      callback_url: callbackUrl,
      metadata: {
        org_id: member.org_id,
        plan_id,
        user_id: user.id,
      },
    }

    // If a Paystack plan code is configured, add it for recurring billing
    if (config.planCode) {
      body.plan = config.planCode
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!data.status || !data.data?.authorization_url) {
      console.error('Paystack initialize failed:', data)
      return NextResponse.json({ error: data.message ?? 'Paystack error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    })
  } catch (err) {
    console.error('paystack/initialize error:', err)
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}
