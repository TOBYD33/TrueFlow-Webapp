// api/export/pdf/route.ts
// Generates a printable HTML expense report — open in browser and Ctrl+P to save as PDF.
// Accepts ?start=YYYY-MM-DD&end=YYYY-MM-DD (falls back to current month).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Receipt } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id, organizations(name)')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No org found' }, { status: 404 })

    const orgId = member.org_id
    const org = member.organizations as unknown as { name: string } | null
    const orgName = org?.name ?? 'Your Business'

    // Support both ?start/end and legacy ?month
    const now = new Date()
    const startParam = req.nextUrl.searchParams.get('start')
    const endParam = req.nextUrl.searchParams.get('end')
    const monthParam = req.nextUrl.searchParams.get('month')

    let startDate: string
    let endDate: string
    let periodLabel: string

    if (startParam && endParam) {
      startDate = startParam
      endDate = endParam
      periodLabel = `${formatDate(startDate)} – ${formatDate(endDate)}`
    } else if (monthParam) {
      const [year, mo] = monthParam.split('-').map(Number)
      startDate = `${year}-${String(mo).padStart(2, '0')}-01`
      endDate = new Date(year, mo, 0).toISOString().split('T')[0]
      periodLabel = new Date(year, mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      periodLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
    }

    const { data: receipts } = await supabase
      .from('receipts')
      .select('*')
      .eq('org_id', orgId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    const rows = (receipts as Receipt[]) ?? []
    const total = rows.reduce((s, r) => s + Number(r.amount), 0)
    const taxTotal = rows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
    const avgAmount = rows.length ? total / rows.length : 0

    // Group by category for summary
    const byCat: Record<string, number> = {}
    for (const r of rows) {
      byCat[r.category] = (byCat[r.category] ?? 0) + Number(r.amount)
    }
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1])

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TrueFlow Report — ${orgName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 13px; background: #fff; padding: 48px; max-width: 900px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #111827; }
  .brand { font-size: 22px; font-weight: 700; color: #6C63FF; }
  .brand-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .report-label { text-align: right; }
  .report-label h2 { font-size: 20px; font-weight: 700; color: #111827; }
  .report-label p { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .stat-box { background: #f9fafb; border-radius: 8px; padding: 16px; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; font-weight: 600; }
  .stat-value { font-size: 20px; font-weight: 700; color: #111827; margin-top: 4px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 12px; }
  thead th { background: #f9fafb; border-bottom: 2px solid #e5e7eb; text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  tbody td { border-bottom: 1px solid #f3f4f6; padding: 10px 12px; }
  tbody tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #111827; background: #f9fafb; }
  .cat-bar { height: 6px; background: #6C63FF; border-radius: 3px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
  .footer p { font-size: 11px; color: #9ca3af; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
  .badge-web { background: rgba(108,99,255,0.1); color: #6C63FF; }
  .badge-whatsapp { background: rgba(37,211,102,0.1); color: #25D366; }
  .badge-mobile { background: rgba(255,181,69,0.1); color: #FFB545; }
  @media print {
    body { padding: 24px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="no-print" style="background:#6C63FF;color:#fff;padding:10px 20px;margin:-48px -48px 32px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
  <span>TrueFlow Report — ready to print</span>
  <button onclick="window.print()" style="background:#fff;color:#6C63FF;border:none;padding:6px 16px;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save as PDF</button>
</div>

<div class="header">
  <div>
    <div class="brand">TrueFlow</div>
    <div class="brand-sub">${orgName}</div>
  </div>
  <div class="report-label">
    <h2>EXPENSE REPORT</h2>
    <p>${periodLabel}</p>
    <p style="margin-top:2px;color:#9ca3af;">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>
</div>

<div class="summary-grid">
  <div class="stat-box">
    <div class="stat-label">Total Spent</div>
    <div class="stat-value">${formatCurrency(total)}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Receipts</div>
    <div class="stat-value">${rows.length}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Average</div>
    <div class="stat-value">${formatCurrency(avgAmount)}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Tax Tracked</div>
    <div class="stat-value">${formatCurrency(taxTotal)}</div>
  </div>
</div>

${catRows.length > 0 ? `
<p class="section-title">Spending by Category</p>
<table>
<thead><tr><th>Category</th><th style="width:200px">Breakdown</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Total</th></tr></thead>
<tbody>
${catRows.map(([cat, amt]) => `
<tr>
  <td>${cat}</td>
  <td><div class="cat-bar" style="width:${total ? Math.round((amt / total) * 200) : 0}px"></div></td>
  <td style="text-align:right;font-weight:600">${formatCurrency(amt)}</td>
  <td style="text-align:right;color:#6b7280">${total ? ((amt / total) * 100).toFixed(1) : 0}%</td>
</tr>`).join('')}
</tbody>
</table>` : ''}

<p class="section-title">All Receipts (${rows.length})</p>
${rows.length === 0 ? '<p style="color:#9ca3af;font-size:12px;margin-bottom:32px">No receipts found for this period.</p>' : `
<table>
<thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">Tax</th><th>Channel</th></tr></thead>
<tbody>
${rows.map(r => `<tr>
  <td style="color:#6b7280">${formatDate(r.date)}</td>
  <td>${r.vendor_name ?? '—'}</td>
  <td>${r.category}</td>
  <td style="text-align:right;font-weight:600">${formatCurrency(r.amount, r.currency)}</td>
  <td style="text-align:right;color:#6b7280">${r.tax_amount ? formatCurrency(r.tax_amount, r.currency) : '—'}</td>
  <td><span class="badge badge-${r.uploaded_via}">${r.uploaded_via}</span></td>
</tr>`).join('')}
<tr class="total-row">
  <td colspan="3">TOTAL</td>
  <td style="text-align:right">${formatCurrency(total)}</td>
  <td style="text-align:right">${formatCurrency(taxTotal)}</td>
  <td></td>
</tr>
</tbody>
</table>`}

<div class="footer">
  <p>TrueFlow — Your true financial flow · gettrueflow.com</p>
  <p>${orgName} · Confidential</p>
</div>

</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="trueflow-report-${startDate}.html"`,
      },
    })
  } catch (err) {
    console.error('export/pdf route failed:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
