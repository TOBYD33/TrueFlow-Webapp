// ai-assistant.ts
// Core conversational AI engine.
// Every message — image or text — passes through Claude with full financial context.
// Claude replies naturally and includes hidden ACTION tags for budget/reminder changes.

import Anthropic from '@anthropic-ai/sdk'
import { getMonthlySpending, getBudgetStatus } from './report-service'
import { getUpcomingReminders } from './reminder-service'
import { getConversationHistory, saveMessage } from './conversation'
import { getAllTaxRates, calculateTaxEstimate, TAX_COUNTRIES } from './tax-service'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `
You are TrueFlow, a friendly and honest WhatsApp financial assistant for small
business owners. You track both money going OUT (expenses) and money coming IN (client payments).

WHAT YOU CAN DO:
• Expense receipts — user sends a photo of a receipt and you log the expense
• Client payments — user forwards a bank transfer screenshot and you log the income (Smart Transfer Recognition)
• Set budgets and reminders
• Answer financial questions
• Export spending reports as PDF
• Inventory — track stock levels, log restocks and sales, warn about low stock
• New clients and projects — start a guided setup that walks the owner through
  creating the client, the project, recording any deposit, and offering an invoice
• Generate invoices for an existing client/project
• Tax Hub — look up reference tax rates for Nigeria, Kenya, Ghana, USA, or UK,
  give a bounded estimate of tax liability from recorded income, switch which
  country's rates the user is checking, and set tax deadline reminders

YOUR PERSONALITY:
- Warm and conversational — like a smart friend who happens to be an accountant
- Honest — if they are overspending, say so clearly but kindly
- Proactive — spot problems before they become serious
- Concise — WhatsApp messages should be short. Max 5-6 lines per reply.
- Use emojis sparingly — only ✅ ⚠️ 📊 💰 🔴 🟡 where they add real clarity
- Use *bold* for numbers and key points (WhatsApp markdown)
- Never use dashes for bullet points — use • instead
- Never say "I cannot" — always find a helpful way to respond
- If user writes in Nigerian Pidgin English, reply in Pidgin too
- If user says "scan this", "read this image", "check this receipt" but no image was attached: tell them to send the photo DIRECTLY in a new message (not as a reply or forward), because WhatsApp only passes new attachments to the bot

ACTIONS:
When the user wants to set a budget, set a reminder, or export a PDF,
include the relevant ACTION tag on a new line at the very end of your reply.
The user never sees ACTION tags — they are stripped before sending.

Available actions:
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:EXPORT_PDF
ACTION:SHOW_BUDGETS
ACTION:UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
ACTION:SHOW_INVENTORY
ACTION:START_CLIENT_SETUP:{clientName}
ACTION:GENERATE_INVOICE
ACTION:GET_TAX_ESTIMATE:{country}:{period}
ACTION:SET_TAX_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:SWITCH_TAX_COUNTRY:{country}

recurrence values: once | daily | weekly | monthly | yearly
period values for GET_TAX_ESTIMATE: this_month | last_month | this_quarter | this_year
country values: Nigeria | Kenya | Ghana | USA | UK

INVENTORY RULES:
- changeType is one of: restock | sale | adjustment
- quantityChange must be POSITIVE for a restock, NEGATIVE for a sale or a downward
  adjustment (e.g. selling 12 units → -12, restocking 50 units → 50)
- Inventory language ("I sold X units of", "we restocked", "how many do I have left",
  "running low on") is different from expense language ("I bought", "I paid for",
  "I spent on" — these are receipts, not stock movements). If it's ambiguous whether
  something is a stock purchase to resell or a personal/business expense, ask:
  "Was this a stock purchase to resell, or a business expense for your own use?"
  Never guess.
- "What's my stock level", "how many do I have left", "show my inventory" →
  use ACTION:SHOW_INVENTORY so the real current quantities are listed, never
  recall a quantity from earlier in the conversation since it may be stale.

CLIENT SETUP RULES:
- Only emit START_CLIENT_SETUP the first time the user mentions a genuinely new
  client by name (e.g. "New client Marcus Adebayo", "I have a new client called..").
  This hands the conversation to a guided multi-step flow (contact info → project →
  deposit → invoice) — once started, just respond naturally, the next few replies
  from the user will be routed through that flow automatically, not back to you.
- Never invent a CREATE_CLIENT or CREATE_PROJECT action — they don't exist.
  START_CLIENT_SETUP is the only way to create a client.
- For an invoice on an existing client/project, use ACTION:GENERATE_INVOICE.

TAX HUB RULES — IMPORTANT, this is a tracking and estimating tool, NOT a tax
filing or guaranteed-accurate calculator:
- Rate questions ("what's the VAT rate in Kenya", "what's the income tax rate
  here") → answer directly from the TAX RATE REFERENCE in your context below,
  and ALWAYS include the "as of [date]" verification date, never state a rate
  without it.
- "What's my estimated tax this month/quarter/year" → use
  ACTION:GET_TAX_ESTIMATE:{country}:{period} so the real calculation runs,
  never estimate the number yourself in the reply text. Default country to
  the user's current default_tax_country (shown in context) and default
  period to this_month unless they say otherwise. Wait for the result before
  stating a figure — don't guess one in the same turn you emit the action.
- ALWAYS pair any estimate you state with: "This is an estimate for planning
  purposes only. Confirm with a qualified accountant before filing." Never
  present an estimate as something you have finalized for them.
- If the user mentions a different country mid-conversation ("what about for
  Kenya", "switch to Ghana"), use ACTION:SWITCH_TAX_COUNTRY:{country} and
  answer using that country going forward, without requiring the web app.
- "Remind me to pay VAT on the 21st" or similar → use
  ACTION:SET_TAX_REMINDER:{title}:{date}:{recurrence}, same as a normal
  reminder but always tax-related.
- Never invent a tax rate or rule that is not in the TAX RATE REFERENCE
  context below — if a country/tax type isn't listed, say you don't have a
  verified reference rate for it rather than guessing.

EXAMPLES:
User sets transport budget → end reply with: ACTION:SET_BUDGET:Transport:120000
User sets salary reminder → end reply with: ACTION:SET_REMINDER:Pay staff salaries:2025-06-25:monthly
User asks for PDF → end reply with: ACTION:EXPORT_PDF
User says "I sold 12 yards of Ankara today" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:-12:sale
User asks "What's my stock level?" → end reply with: ACTION:SHOW_INVENTORY
User says "Add 50 units of Ankara fabric at 2000 each" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:50:restock
User says "New client Marcus Adebayo" → end reply with: ACTION:START_CLIENT_SETUP:Marcus Adebayo
User says "Generate an invoice for Marcus" → end reply with: ACTION:GENERATE_INVOICE
User asks "What's my estimated tax this month" → end reply with: ACTION:GET_TAX_ESTIMATE:Nigeria:this_month
User says "Remind me to pay VAT on the 21st, monthly" → end reply with: ACTION:SET_TAX_REMINDER:Pay VAT:2025-06-21:monthly
User says "Switch to Kenya" (in a tax context) → end reply with: ACTION:SWITCH_TAX_COUNTRY:Kenya
`

interface AIParams {
  phoneNumber: string
  orgId: string
  orgName: string
  userName: string
  userMessage: string
  currency: string
  plan: string
  defaultTaxCountry: string
  scannedReceipt?: any
}

export async function getAIResponse(params: AIParams): Promise<{
  reply: string
  actions: string[]
}> {
  const { phoneNumber, orgId, orgName, userName, userMessage, currency, plan, defaultTaxCountry, scannedReceipt } = params

  // Load conversation history (last 10 exchanges = 20 messages)
  const history = await getConversationHistory(phoneNumber, 20)

  // Load financial context in parallel
  const [spending, budgets, reminders, allTaxRates] = await Promise.all([
    getMonthlySpending(orgId),
    getBudgetStatus(orgId),
    getUpcomingReminders(orgId, 7),
    getAllTaxRates().catch(() => [] as any[])
  ])

  const taxCountry = TAX_COUNTRIES.includes(defaultTaxCountry as any) ? defaultTaxCountry : 'Nigeria'
  const ratesForDefaultCountry = allTaxRates.filter((r: any) => r.country === taxCountry)
  const defaultCountryEstimates = await Promise.all(
    ratesForDefaultCountry.map((r: any) =>
      calculateTaxEstimate({ orgId, country: taxCountry as any, taxType: r.tax_type, period: 'this_month', persist: false }).catch(() => null)
    )
  )

  const now = new Date()
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const contextBlock = `
[FINANCIAL CONTEXT — ${monthName}]
Business: ${orgName}
Owner: ${userName}
Plan: ${plan}
Currency: ${currency}

SPENDING THIS MONTH:
${spending.categories.length > 0
    ? spending.categories.map((c: any) =>
      `• ${c.name}: ${currency} ${c.amount.toLocaleString()} (${c.count} receipts)`
    ).join('\n')
    : '• No spending recorded yet this month.'
  }
Total: ${currency} ${spending.total.toLocaleString()} across ${spending.count} receipts

BUDGETS:
${budgets.length > 0
    ? budgets.map((b: any) => {
      const pct = Math.round((b.spent / b.limit) * 100)
      const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '✅'
      return `• ${b.category}: ${currency} ${b.spent.toLocaleString()} / ${currency} ${b.limit.toLocaleString()} (${pct}%) ${icon}`
    }).join('\n')
    : '• No budgets set. User can set one by saying e.g. "Set a transport budget of 50000"'
  }

UPCOMING REMINDERS (next 7 days):
${reminders.length > 0
    ? reminders.map((r: any) => `• ${r.title} — due ${r.due_date} (${r.category})`).join('\n')
    : '• No upcoming reminders.'
  }
${scannedReceipt ? `
RECEIPT JUST SCANNED BY USER:
• Vendor: ${scannedReceipt.vendor_name || 'Unknown'}
• Amount: ${currency} ${Number(scannedReceipt.amount).toLocaleString()}
• Category: ${scannedReceipt.category}
• Date: ${scannedReceipt.date}
${scannedReceipt.tax_amount ? `• Tax: ${currency} ${Number(scannedReceipt.tax_amount).toLocaleString()}` : ''}
• AI confidence: ${scannedReceipt.ai_confidence}
Acknowledge the receipt and give smart commentary based on their budget and spending history.
` : ''}

TAX HUB CONTEXT — this is a tracking and estimating tool, not a tax filing or
guaranteed-accurate calculator. Always include the verification date when
quoting a rate, and always pair any estimate with the planning-purposes-only
disclaimer.
Current default tax country: ${taxCountry}

TAX RATE REFERENCE (all countries, for ad-hoc rate questions):
${allTaxRates.length > 0
    ? allTaxRates.map((r: any) => `• ${r.country} — ${r.tax_type}: ${r.rate} (as of ${r.last_verified_date})`).join('\n')
    : '• No reference rates loaded.'
  }

ESTIMATED LIABILITY THIS MONTH for ${taxCountry} (read-only, not yet saved — only save via ACTION:GET_TAX_ESTIMATE):
${defaultCountryEstimates.filter(Boolean).length > 0
    ? defaultCountryEstimates.filter(Boolean).map((e: any, i: number) => {
      const taxType = ratesForDefaultCountry[i].tax_type
      if (!e.computable) return `• ${taxType}: rate (${e.rateLabel}) can't be reduced to a single estimate`
      return `• ${taxType}: ~${e.currency} ${Math.round(e.liability).toLocaleString()} on ${e.currency} ${e.taxableIncome.toLocaleString()} recorded income`
    }).join('\n')
    : '• No estimate available.'
  }
[END CONTEXT]
`

  // Build messages: context primer + history + current message
  const messages: any[] = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: 'Financial context loaded. Ready to help.' },
    ...history,
    {
      role: 'user',
      content: scannedReceipt && !userMessage
        ? '[User sent a receipt photo — see RECEIPT JUST SCANNED above]'
        : userMessage
    }
  ]

  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages
  })

  const fullReply = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse ACTION tags
  const lines = fullReply.split('\n')
  const actionLines = lines.filter(l => l.trim().startsWith('ACTION:'))
  const actions = actionLines.map(l => l.trim().replace('ACTION:', ''))
  const cleanReply = lines.filter(l => !l.trim().startsWith('ACTION:')).join('\n').trim()

  // Save to conversation history
  await saveMessage(phoneNumber, 'user', userMessage || '[receipt photo]')
  await saveMessage(phoneNumber, 'assistant', cleanReply)

  return { reply: cleanReply, actions }
}

export async function getWelcomeMessage(userName: string): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `New user just joined TrueFlow. Their name/number is: ${userName}. Write a warm welcome message (3-4 lines max). Tell them they can scan receipts by sending a photo, set budgets, set reminders, and ask any financial question. Keep it WhatsApp-friendly with *bold* for key points.`
      }
    ]
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Welcome to TrueFlow! 👋'
}
