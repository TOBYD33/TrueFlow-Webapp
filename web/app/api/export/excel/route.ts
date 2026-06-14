// api/export/excel/route.ts
// Exports receipts as a CSV file (Excel-compatible)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Receipt } from '@/types'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No org found' }, { status: 404 })

    const month = req.nextUrl.searchParams.get('month')
    let query = supabase
      .from('receipts')
      .select('*')
      .eq('org_id', member.org_id)
      .order('date', { ascending: false })

    if (month) {
      const [year, mo] = month.split('-').map(Number)
      query = query
        .gte('date', `${year}-${String(mo).padStart(2, '0')}-01`)
        .lte('date', new Date(year, mo, 0).toISOString().split('T')[0])
    }

    const { data: receipts } = await query
    const rows = (receipts as Receipt[]) ?? []

    const headers = ['Date', 'Vendor', 'Category', 'Amount', 'Currency', 'Tax', 'Channel', 'Confidence', 'Verified']
    const lines = [
      headers.join(','),
      ...rows.map(r => [
        r.date,
        `"${(r.vendor_name ?? '').replace(/"/g, '""')}"`,
        r.category,
        r.amount,
        r.currency,
        r.tax_amount ?? '',
        r.uploaded_via,
        r.ai_confidence ?? '',
        r.is_verified ? 'Yes' : 'No',
      ].join(',')),
    ]

    const csv = lines.join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="trueflio-receipts${month ? '-' + month : ''}.csv"`,
      },
    })
  } catch (err) {
    console.error('export/excel route failed:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
