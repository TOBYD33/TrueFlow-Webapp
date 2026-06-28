// api/export/excel/route.ts
// Exports receipts as a CSV file (Excel-compatible).
// Accepts ?start=YYYY-MM-DD&end=YYYY-MM-DD (falls back to legacy ?month or all receipts).

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

    const startParam = req.nextUrl.searchParams.get('start')
    const endParam = req.nextUrl.searchParams.get('end')
    const monthParam = req.nextUrl.searchParams.get('month')

    let startDate: string | null = null
    let endDate: string | null = null
    let filenameSuffix = ''

    if (startParam && endParam) {
      startDate = startParam
      endDate = endParam
      filenameSuffix = `-${startParam}-to-${endParam}`
    } else if (monthParam) {
      const [year, mo] = monthParam.split('-').map(Number)
      startDate = `${year}-${String(mo).padStart(2, '0')}-01`
      endDate = new Date(year, mo, 0).toISOString().split('T')[0]
      filenameSuffix = `-${monthParam}`
    }

    let query = supabase
      .from('receipts')
      .select('*')
      .eq('org_id', member.org_id)
      .order('date', { ascending: false })

    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data: receipts } = await query
    const rows = (receipts as Receipt[]) ?? []

    const headers = ['Date', 'Vendor', 'Category', 'Amount', 'Currency', 'Tax', 'Channel', 'Notes']
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
        `"${(r.notes ?? '').replace(/"/g, '""')}"`,
      ].join(',')),
    ]

    const csv = lines.join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="trueflow-receipts${filenameSuffix}.csv"`,
      },
    })
  } catch (err) {
    console.error('export/excel route failed:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
