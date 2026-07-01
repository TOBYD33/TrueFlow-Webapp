// api/andrea/total/route.ts
// Public community counter — returns the aggregate total contributed to Andrea Aid
// across all TrueFlow organizations. No auth required (aggregate only, no org data).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 300 // cache for 5 minutes

export async function GET() {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await admin
      .from('andrea_contributions')
      .select('amount')

    if (error) throw new Error(error.message)

    const total = (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)

    return NextResponse.json({ total: Math.round(total * 100) / 100 }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    console.error('andrea/total failed:', err)
    return NextResponse.json({ total: null }, { status: 500 })
  }
}
