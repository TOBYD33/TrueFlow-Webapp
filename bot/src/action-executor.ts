// action-executor.ts
// Parses and executes action strings Claude includes at the end of its replies.
// e.g. "SET_BUDGET:Transport:120000" → writes budget to Supabase

import { setBudget } from './budget-service'
import { setReminder } from './reminder-service'
import { generateAndSendPDF } from './pdf-generator'
import { getBudgetStatus } from './report-service'

export async function executeActions(actions: string[], user: any): Promise<string[]> {
  const notifications: string[] = []

  for (const action of actions) {
    const parts = action.split(':')
    const type = parts[0]

    try {
      switch (type) {
        case 'SET_BUDGET': {
          // SET_BUDGET:Transport:120000
          const [, category, amount] = parts
          await setBudget({ orgId: user.org_id, category, amount: parseFloat(amount) })
          break
        }
        case 'SET_REMINDER': {
          // SET_REMINDER:Pay VAT:2025-06-21:monthly
          const [, title, date, recurrence] = parts
          await setReminder({ orgId: user.org_id, title, dueDate: date, recurrence: recurrence || 'once' })
          break
        }
        case 'EXPORT_PDF': {
          await generateAndSendPDF(user.org_id, user.whatsapp_number)
          break
        }
        case 'SHOW_BUDGETS': {
          const budgets = await getBudgetStatus(user.org_id)
          if (budgets.length === 0) {
            notifications.push('No budgets set yet. Say "Set a [category] budget of [amount]" to create one.')
          } else {
            const lines = budgets.map(b => {
              const pct = Math.round((b.spent / b.limit) * 100)
              const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '✅'
              return `• ${b.category}: ${user.currency} ${b.spent.toLocaleString()} / ${user.currency} ${b.limit.toLocaleString()} (${pct}%) ${icon}`
            })
            notifications.push(`📊 *Your Budgets:*\n${lines.join('\n')}`)
          }
          break
        }
        default:
          break
      }
    } catch (err) {
      console.error(`executeAction ${type} failed:`, err)
    }
  }

  return notifications
}
