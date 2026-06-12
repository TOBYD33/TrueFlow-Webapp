// budget-service.ts
// Create, update, and read budgets. Checks budget alerts at 80% and 100%.

import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'
import { getMonthlySpending } from './report-service'

export async function setBudget(params: {
  orgId: string
  category: string
  amount: number
  period?: 'monthly' | 'weekly'
}): Promise<void> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const period = params.period || 'monthly'

  const { error } = await supabase
    .from('budgets')
    .upsert({
      org_id: params.orgId,
      category: params.category,
      amount: params.amount,
      period,
      month,
      year
    }, { onConflict: 'org_id,category,month,year' })

  if (error) throw new Error(error.message)
}

export async function getBudgets(orgId: string) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('org_id', orgId)
    .or(`and(month.eq.${month},year.eq.${year}),and(period.eq.monthly,month.is.null)`)

  if (error) throw new Error(error.message)
  return data || []
}

// Called every hour by scheduler to check if anyone hit 80% or 100%
export async function checkBudgetAlerts() {
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, currency, name')

  if (error) { console.error('checkBudgetAlerts: orgs query failed:', error); return }

  for (const org of orgs || []) {
    try {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('org_id', org.id)
        .or(`and(month.eq.${month},year.eq.${year}),and(period.eq.monthly,month.is.null)`)

      if (!budgets || budgets.length === 0) continue

      const spending = await getMonthlySpending(org.id)
      const spendingMap: Record<string, number> = {}
      for (const cat of spending.categories) {
        spendingMap[cat.name] = cat.amount
      }

      const { data: owner } = await supabase
        .from('org_members')
        .select('whatsapp_number')
        .eq('org_id', org.id)
        .eq('role', 'owner')
        .eq('whatsapp_active', true)
        .single()

      if (!owner?.whatsapp_number) continue

      for (const budget of budgets) {
        const spent = spendingMap[budget.category] || 0
        const pct = (spent / Number(budget.amount)) * 100

        if (pct >= 100 && pct < 105) {
          // Fire once near the 100% threshold to avoid repeated alerts
          const msg = `🔴 *Budget Alert: ${budget.category}*\n\nYou've hit your ${org.currency} ${Number(budget.amount).toLocaleString()} budget for ${budget.category}. Every new expense in this category is over budget.`
          await sendWhatsAppMessage(owner.whatsapp_number, msg)
        } else if (pct >= 80 && pct < 85) {
          const msg = `🟡 *Budget Warning: ${budget.category}*\n\nYou've used *${Math.round(pct)}%* of your ${org.currency} ${Number(budget.amount).toLocaleString()} budget. ${org.currency} ${(Number(budget.amount) - spent).toLocaleString()} remaining.`
          await sendWhatsAppMessage(owner.whatsapp_number, msg)
        }
      }
    } catch (err) {
      console.error(`checkBudgetAlerts: failed for org ${org.id}:`, err)
    }
  }
}
