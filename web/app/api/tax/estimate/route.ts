// api/tax/estimate/route.ts
// Computes a bounded Layer 3 tax liability estimate from recorded client
// payments for the selected country/tax type/period, and logs it to
// tax_estimates. This is an estimating tool, not a filing calculator —
// when a rate can't be reduced to a single percentage (e.g. "varies by
// state"), no number is fabricated.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getPeriodRange, parseRateEstimate, COUNTRY_TO_CURRENCY, TaxPeriodKey } from '@/lib/tax'
import { TaxCountry } from '@/types'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const country = body.country as TaxCountry
    const taxType = body.taxType as string
    const period = (body.period as TaxPeriodKey) || 'this_month'

    if (!country || !taxType) {
      return NextResponse.json({ error: 'country and taxType are required' }, { status: 400 })
    }

    const admin = getAdmin()

    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })

    const { data: rateRow } = await admin
      .from('tax_rate_reference')
      .select('*')
      .eq('country', country)
      .eq('tax_type', taxType)
      .maybeSingle()

    if (!rateRow) return NextResponse.json({ error: 'No reference rate found for that country/tax type' }, { status: 404 })

    const range = getPeriodRange(period)

    const { data: payments } = await admin
      .from('client_payments')
      .select('amount')
      .eq('org_id', member.org_id)
      .gte('payment_date', range.start)
      .lte('payment_date', range.end)

    const taxableIncome = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
    const currency = COUNTRY_TO_CURRENCY[country]
    const parsed = parseRateEstimate(rateRow.rate)

    if (!parsed) {
      return NextResponse.json({
        computable: false,
        taxableIncome,
        currency,
        rateLabel: rateRow.rate,
        lastVerifiedDate: rateRow.last_verified_date,
        periodLabel: range.label,
      })
    }

    const liability = taxableIncome * parsed.pct

    const { error: insertError } = await admin.from('tax_estimates').insert({
      org_id: member.org_id,
      period_start: range.start,
      period_end: range.end,
      country,
      estimated_taxable_income: taxableIncome,
      estimated_liability: liability,
      tax_type: taxType,
    })

    if (insertError) console.error('tax_estimates insert failed:', insertError)

    return NextResponse.json({
      computable: true,
      taxableIncome,
      liability,
      ratePct: parsed.pct,
      approximate: parsed.approximate,
      currency,
      rateLabel: rateRow.rate,
      lastVerifiedDate: rateRow.last_verified_date,
      periodLabel: range.label,
    })
  } catch (err) {
    console.error('tax/estimate POST error:', err)
    return NextResponse.json({ error: 'Failed to calculate estimate' }, { status: 500 })
  }
}
