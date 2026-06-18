// pdf-generator.ts
// Generates a monthly expense report as PDF, uploads to Supabase Storage,
// then sends the download link via WhatsApp.

import puppeteer from 'puppeteer'
import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'
import { getMonthlySpending, getBudgetStatus } from './report-service'

export async function generateAndSendPDF(orgId: string, whatsappNumber: string): Promise<void> {
  try {
    const now = new Date()
    const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const { data: org } = await supabase
      .from('organizations')
      .select('name, currency')
      .eq('id', orgId)
      .single()

    const spending = await getMonthlySpending(orgId)
    const budgets = await getBudgetStatus(orgId)
    const currency = org?.currency || 'NGN'

    // Get full receipt list for this month
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    const { data: receipts } = await supabase
      .from('receipts')
      .select('*')
      .eq('org_id', orgId)
      .gte('date', firstOfMonth)
      .lte('date', lastOfMonth)
      .order('date', { ascending: false })

    const html = buildReportHtml({
      orgName: org?.name || 'My Business',
      monthName,
      currency,
      spending,
      budgets,
      receipts: receipts || []
    })

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    await browser.close()

    // Upload to Supabase Storage
    const filename = `reports/${orgId}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('generateAndSendPDF: upload failed:', uploadError)
      await sendWhatsAppMessage(whatsappNumber, '⚠️ Sorry, I could not generate your PDF right now. Please try again.')
      return
    }

    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(filename)
    const publicUrl = urlData.publicUrl

    await sendWhatsAppMessage(
      whatsappNumber,
      `📋 *Your ${monthName} Report is ready!*\n\n${publicUrl}\n\nThis link is valid for 30 days.`
    )
  } catch (err) {
    console.error('generateAndSendPDF failed:', err)
    await sendWhatsAppMessage(whatsappNumber, '⚠️ Sorry, I could not generate your PDF right now. Please try again.')
  }
}

function buildReportHtml(data: {
  orgName: string
  monthName: string
  currency: string
  spending: any
  budgets: any[]
  receipts: any[]
}): string {
  const { orgName, monthName, currency, spending, budgets, receipts } = data

  const categoryRows = spending.categories.map((c: any) => `
    <tr>
      <td>${c.name}</td>
      <td style="text-align:right">${currency} ${c.amount.toLocaleString()}</td>
      <td style="text-align:center">${c.count}</td>
    </tr>
  `).join('')

  const budgetRows = budgets.map((b: any) => {
    const pct = Math.round((b.spent / b.limit) * 100)
    const color = pct >= 100 ? '#e53e3e' : pct >= 80 ? '#dd6b20' : '#38a169'
    return `
      <tr>
        <td>${b.category}</td>
        <td style="text-align:right">${currency} ${b.spent.toLocaleString()}</td>
        <td style="text-align:right">${currency} ${b.limit.toLocaleString()}</td>
        <td style="text-align:center;color:${color}">${pct}%</td>
      </tr>
    `
  }).join('')

  const receiptRows = receipts.slice(0, 50).map((r: any) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.vendor_name || '—'}</td>
      <td>${r.category}</td>
      <td style="text-align:right">${currency} ${Number(r.amount || 0).toLocaleString()}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #333; padding: 40px; }
  h1 { color: #1a365d; }
  h2 { color: #2d3748; margin-top: 30px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #2d3748; color: white; padding: 8px 12px; text-align: left; }
  td { padding: 6px 12px; border-bottom: 1px solid #e2e8f0; }
  tr:hover { background: #f7fafc; }
  .total { font-weight: bold; font-size: 1.1em; margin-top: 10px; }
  .footer { margin-top: 40px; font-size: 0.8em; color: #718096; }
</style>
</head>
<body>
  <h1>TrueFlow — Expense Report</h1>
  <p><strong>${orgName}</strong> | ${monthName}</p>
  <p class="total">Total Spent: ${currency} ${spending.total.toLocaleString()} (${spending.count} receipts)</p>

  <h2>Spending by Category</h2>
  <table>
    <tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:center">Receipts</th></tr>
    ${categoryRows || '<tr><td colspan="3">No spending this month.</td></tr>'}
  </table>

  ${budgets.length > 0 ? `
  <h2>Budget Status</h2>
  <table>
    <tr><th>Category</th><th style="text-align:right">Spent</th><th style="text-align:right">Budget</th><th style="text-align:center">Used</th></tr>
    ${budgetRows}
  </table>` : ''}

  <h2>Recent Receipts</h2>
  <table>
    <tr><th>Date</th><th>Vendor</th><th>Category</th><th style="text-align:right">Amount</th></tr>
    ${receiptRows || '<tr><td colspan="4">No receipts this month.</td></tr>'}
  </table>
  ${receipts.length > 50 ? `<p style="font-size:0.85em;color:#718096">Showing 50 of ${receipts.length} receipts.</p>` : ''}

  <div class="footer">Generated by TrueFlow · gettrueflow.com · ${new Date().toLocaleDateString()}</div>
</body>
</html>`
}
