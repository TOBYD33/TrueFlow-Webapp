// action-executor.ts
// Parses and executes action strings Claude includes at the end of its replies.
// e.g. "SET_BUDGET:Transport:120000" → writes budget to Supabase

import { setBudget } from './budget-service'
import { setReminder } from './reminder-service'
import { generateAndSendPDF } from './pdf-generator'
import { getBudgetStatus } from './report-service'
import { getInventoryItems, addInventoryItem, updateStock, getLowStockItems } from './inventory-service'
import { startGuidedClientSetup } from './client-setup-service'
import { findClientByName } from './client-service'
import { recordClientPayment } from './client-payment-service'
import { calculateTaxEstimate, formatEstimateReply, setTaxCountry, TAX_COUNTRIES, DEFAULT_INCOME_TAX_TYPE, TaxCountry, TaxPeriodKey } from './tax-service'

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
        case 'UPDATE_INVENTORY': {
          // UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
          const [, itemName, quantityChangeStr, changeType] = parts
          const items = await getInventoryItems(user.org_id)
          const item = items.find(
            (i: any) => i.name.toLowerCase() === itemName.toLowerCase()
          )
          const qty = parseFloat(quantityChangeStr)
          if (item) {
            await updateStock({
              orgId: user.org_id,
              itemId: item.id,
              quantityChange: qty,
              changeType: changeType as 'restock' | 'sale' | 'adjustment',
              createdBy: user.user_id
            })
          } else if (qty > 0) {
            await addInventoryItem({
              orgId: user.org_id,
              name: itemName,
              quantity: qty
            })
          }
          break
        }

        case 'SHOW_INVENTORY': {
          const items = await getInventoryItems(user.org_id)
          if (items.length === 0) {
            notifications.push('No inventory items yet. Say "Add 50 units of [item] at [cost] each" to create one.')
          } else {
            const lowStock = await getLowStockItems(user.org_id)
            const lowStockIds = new Set(lowStock.map((i: any) => i.id))
            const lines = items.map((i: any) => {
              const icon = lowStockIds.has(i.id) ? '🔴' : '✅'
              return `• ${i.name}: ${i.quantity_on_hand} units ${icon}`
            })
            notifications.push(`📦 *Your Inventory:*\n${lines.join('\n')}`)
          }
          break
        }

        case 'LOG_PAYMENT': {
          // LOG_PAYMENT:{clientName}:{amount}
          // clientName may contain spaces; amount is always the last colon-separated segment
          const paymentParts = parts.slice(1)
          const amountStr = paymentParts[paymentParts.length - 1]
          const clientName = paymentParts.slice(0, -1).join(':').trim()
          const amount = parseFloat(amountStr)

          if (!clientName || isNaN(amount) || amount <= 0) break

          const client = await findClientByName(user.org_id, clientName)
          if (!client) {
            notifications.push(
              `I couldn't find a client matching "${clientName}". Create them first by saying "New client ${clientName}".`
            )
            break
          }

          await recordClientPayment({
            orgId: user.org_id,
            clientId: client.id,
            amount,
            currency: user.currency || 'NGN',
          })

          const currency = user.currency || 'NGN'
          notifications.push(
            `✅ *Payment logged!*\n\n` +
            `${currency} ${amount.toLocaleString()} from *${client.name}*\n` +
            `Open your dashboard to link it to a specific project: app.trueflio.com/income`
          )
          break
        }

        case 'GENERATE_INVOICE': {
          // GENERATE_INVOICE:{clientId}:{projectId}
          // Invoice generation is handled in the web app — acknowledge only
          notifications.push(
            'Invoice generation is available on your web dashboard: app.trueflio.com/invoices'
          )
          break
        }

        case 'START_CLIENT_SETUP': {
          // START_CLIENT_SETUP:{clientName}
          const clientName = parts.slice(1).join(':').trim()
          if (clientName) {
            await startGuidedClientSetup(user.org_id, user.whatsapp_number, clientName)
          }
          break
        }

        case 'GET_TAX_ESTIMATE': {
          // GET_TAX_ESTIMATE:{country}:{period}
          const [, countryRaw, periodRaw] = parts
          const country = (TAX_COUNTRIES.includes(countryRaw as TaxCountry) ? countryRaw : user.default_tax_country) as TaxCountry
          const period = (periodRaw || 'this_month') as TaxPeriodKey
          const taxType = DEFAULT_INCOME_TAX_TYPE[country]

          const estimateResult = await calculateTaxEstimate({ orgId: user.org_id, country, taxType, period, persist: true })
            .catch(() => null)

          if (estimateResult) {
            notifications.push(formatEstimateReply(taxType, country, estimateResult as any))
          } else {
            notifications.push(`I don't have a reference rate for ${taxType} in ${country} yet.`)
          }
          break
        }

        case 'SET_TAX_REMINDER': {
          // SET_TAX_REMINDER:{title}:{date}:{recurrence}
          const [, title, date, recurrence] = parts
          await setReminder({ orgId: user.org_id, title, dueDate: date, recurrence: recurrence || 'once', category: 'tax' })
          break
        }

        case 'SWITCH_TAX_COUNTRY': {
          // SWITCH_TAX_COUNTRY:{country}
          const [, country] = parts
          if (TAX_COUNTRIES.includes(country as TaxCountry)) {
            await setTaxCountry(user.org_id, country as TaxCountry)
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
