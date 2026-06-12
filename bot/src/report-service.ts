// report-service.ts
// Generates spending summaries and budget status for AI context and scheduled reports.
// Also sends weekly and monthly summaries via WhatsApp.

import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'
import { MonthlySpending, BudgetStatus } from '../types'

export async function getMonthlySpending(orgId: string): Promise<MonthlySpending> {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('receipts')
    .select('amount, category')
    .eq('org_id', orgId)
    .gte('date', firstOfMonth)
    .lte('date', lastOfMonth)

  if (error) {
    console.error('getMonthlySpending failed:', error)
    return { total: 0, count: 0, categories: [] }
  }

  const receipts = data || []
  const total = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  const catMap: Record<string, { amount: number; count: number }> = {}
  for (const r of receipts) {
    const cat = r.category || 'Other'
    if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 }
    catMap[cat].amount += Number(r.amount) || 0
    catMap[cat].count += 1
  }

  const categories = Object.entries(catMap)
    .map(([name, val]) => ({ name, amount: val.amount, count: val.count }))
    .sort((a, b) => b.amount - a.amount)

  return { total, count: receipts.length, categories }
}

export async function getBudgetStatus(orgId: string): Promise<BudgetStatus[]> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('org_id', orgId)
    .or(`and(month.eq.${month},year.eq.${year}),and(period.eq.monthly,month.is.null)`)

  if (error) {
    console.error('getBudgetStatus failed:', error)
    return []
  }

  if (!budgets || budgets.length === 0) return []

  const spending = await getMonthlySpending(orgId)
  const spendingMap: Record<string, number> = {}
  for (const cat of spending.categories) {
    spendingMap[cat.name] = cat.amount
  }

  return budgets.map(b => ({
    category: b.category,
    limit: Number(b.amount),
    spent: spendingMap[b.category] || 0,
    period: b.period
  }))
}

export async function sendWeeklySummaries() {
  // Get all active orgs with WhatsApp owners
  const { data: members, error } = await supabase
    .from('org_members')
    .select('org_id, whatsapp_number, organizations(name, currency)')
    .eq('role', 'owner')
    .eq('whatsapp_active', true)
    .not('whatsapp_number', 'is', null)

  if (error) { console.error('sendWeeklySummaries failed:', error); return }

  for (const member of members || []) {
    try {
      const org = member.organizations as any
      const spending = await getMonthlySpending(member.org_id)
      const budgets = await getBudgetStatus(member.org_id)
      const currency = org?.currency || 'NGN'

      const lines = [`📊 *Weekly Summary — ${org?.name || 'Your Business'}*\n`]

      if (spending.categories.length > 0) {
        lines.push('*Top spending this month:*')
        for (const cat of spending.categories.slice(0, 5)) {
          lines.push(`• ${cat.name}: ${currency} ${cat.amount.toLocaleString()}`)
        }
        lines.push(`\n*Total: ${currency} ${spending.total.toLocaleString()}* (${spending.count} receipts)`)
      } else {
        lines.push('No receipts scanned this month yet.')
      }

      const overBudget = budgets.filter(b => b.spent >= b.limit)
      if (overBudget.length > 0) {
        lines.push(`\n⚠️ *Over budget:* ${overBudget.map(b => b.category).join(', ')}`)
      }

      await sendWhatsAppMessage(member.whatsapp_number, lines.join('\n'))
    } catch (err) {
      console.error(`sendWeeklySummaries: failed for ${member.org_id}:`, err)
    }
  }
}

export async function sendMonthlyReports() {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const monthName = lastMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const { data: members, error } = await supabase
    .from('org_members')
    .select('org_id, whatsapp_number, organizations(name, currency)')
    .eq('role', 'owner')
    .eq('whatsapp_active', true)
    .not('whatsapp_number', 'is', null)

  if (error) { console.error('sendMonthlyReports failed:', error); return }

  for (const member of members || []) {
    try {
      const org = member.organizations as any
      const currency = org?.currency || 'NGN'

      // Get last month's spending
      const firstOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).toISOString().split('T')[0]
      const lastOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).toISOString().split('T')[0]

      const { data: receipts } = await supabase
        .from('receipts')
        .select('amount, category')
        .eq('org_id', member.org_id)
        .gte('date', firstOfLastMonth)
        .lte('date', lastOfLastMonth)

      const total = (receipts || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

      const message = [
        `📋 *Monthly Report — ${monthName}*`,
        `Business: ${org?.name || 'Your Business'}`,
        `\n*Total spent: ${currency} ${total.toLocaleString()}*`,
        `Receipts scanned: ${receipts?.length || 0}`,
        `\nReply "export pdf" to get a full PDF report.`
      ].join('\n')

      await sendWhatsAppMessage(member.whatsapp_number, message)
    } catch (err) {
      console.error(`sendMonthlyReports: failed for ${member.org_id}:`, err)
    }
  }
}
