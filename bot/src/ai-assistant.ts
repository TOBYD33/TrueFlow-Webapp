// ai-assistant.ts
// Core conversational AI engine.
// Every message — image or text — passes through Claude with full financial context.
// Claude replies naturally and includes hidden ACTION tags for budget/reminder changes.

import Anthropic from '@anthropic-ai/sdk'
import { getMonthlySpending, getBudgetStatus } from './report-service'
import { getUpcomingReminders } from './reminder-service'
import { getConversationHistory, saveMessage } from './conversation'
import { getAllTaxRates, calculateTaxEstimate, TAX_COUNTRIES } from './tax-service'
import { getClientsByOrg } from './client-service'
import { getProjectsByClient } from './project-service'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Phone-country-code → IANA timezone, first pass until a per-user timezone
// field exists. Longest codes checked first so e.g. '234' isn't shadowed by
// a shorter, unrelated prefix. Defaults to WAT (the primary market) when a
// number's country code isn't in this list.
const COUNTRY_CODE_TIMEZONES: Record<string, string> = {
  '234': 'Africa/Lagos',        // Nigeria
  '254': 'Africa/Nairobi',      // Kenya
  '233': 'Africa/Accra',        // Ghana
  '27': 'Africa/Johannesburg',  // South Africa
  '44': 'Europe/London',        // UK
  '92': 'Asia/Karachi',         // Pakistan
  '55': 'America/Sao_Paulo',    // Brazil
  '1': 'America/New_York',      // USA/Canada — coarse approximation, no area-code precision
}
const DEFAULT_TIMEZONE = 'Africa/Lagos'
const SORTED_COUNTRY_CODES = Object.keys(COUNTRY_CODE_TIMEZONES).sort((a, b) => b.length - a.length)

function resolveTimezone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '')
  for (const code of SORTED_COUNTRY_CODES) {
    if (digits.startsWith(code)) return COUNTRY_CODE_TIMEZONES[code]
  }
  return DEFAULT_TIMEZONE
}

function dateStrInTimezone(tz: string, date: Date): string {
  // en-CA formats as YYYY-MM-DD, exactly what due_date columns expect
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

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

IMPORTANT — for ACTION:SET_BUDGET, ACTION:SET_REMINDER, and ACTION:SET_TAX_REMINDER
specifically: do NOT write your own "Got it ✅" confirmation with the saved
date, time, or amount. The system verifies the database write actually
succeeded and sends its own confirmation (or an honest failure notice) after
your reply. Just acknowledge briefly in normal conversation ("Sure, setting
that up now" or similar) without restating specifics as if already saved —
stating details as fact before the write is confirmed is what causes false
confirmations when a save silently fails.

Available actions:
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}:{HHMM}
  (YYYY-MM-DD — ALWAYS compute this from the CURRENT DATE AND TIME block
   given in your context below, never from memory, never from an example
   date shown anywhere in these instructions, and never left as a guess.
   "today"/"tomorrow"/"yesterday" are given to you pre-computed in that
   block — use those exact values, do not do the arithmetic yourself.
   For anything else relative ("next Friday", "in 3 days", "the 25th"),
   calculate it yourself starting from that block's real current date.
   HHMM = optional time as 4 digits, 24-hour, in the user's own local time
   as stated in that block. ALWAYS include it when the user gives a time.
   Omit only when no time is given — those reminders deliver at 8:00 AM on
   the due date.
   If the user says "today" for a clock time that has ALREADY PASSED
   relative to the current time in that block, do NOT silently emit
   SET_REMINDER with a same-day date — ask first: "That time's already
   passed today — did you mean tomorrow, or is this for right now?" Wait
   for their answer before emitting the action.
   Emit SET_REMINDER ONLY when the user is creating or changing a reminder.
   Never emit it when they are merely asking about one — e.g. "did you set
   the reminder?" is a question, answer it without any ACTION tag. To change
   an existing reminder's time, emit SET_REMINDER with the SAME title and
   date and the new time — it updates in place, it does not duplicate.)
ACTION:EXPORT_PDF
ACTION:SHOW_BUDGETS
ACTION:UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
ACTION:SHOW_INVENTORY
ACTION:START_CLIENT_SETUP:{clientName}
ACTION:LOG_PAYMENT:{clientName}:{amount}
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

CLIENT AND PAYMENT RULES:
- Only emit START_CLIENT_SETUP the first time the user mentions a genuinely new
  client by name (e.g. "New client Marcus Adebayo", "I have a new client called..").
  This hands the conversation to a guided multi-step flow (contact info → project →
  deposit → invoice) — once started, just respond naturally, the next few replies
  from the user will be routed through that flow automatically, not back to you.
- Never invent a CREATE_CLIENT or CREATE_PROJECT action — they don't exist.
  START_CLIENT_SETUP is the only way to create a client.
- When the user says a client paid them (e.g. "Marcus paid me 50k", "I received
  150,000 from Amaka", "Client payment from Tunde — 300k"), emit
  ACTION:LOG_PAYMENT:{clientName}:{amount} on a new line at the very end of your reply.
  Only use this if the client name appears in the ACTIVE CLIENTS list below — if the
  client doesn't exist yet, ask the user to create them first with START_CLIENT_SETUP.
  Never emit LOG_PAYMENT for a client you cannot confirm exists.
- For an invoice on an existing client/project, use ACTION:GENERATE_INVOICE.
- Client balance questions (e.g. "What does Marcus owe me?") — answer from the
  ACTIVE CLIENTS + PROJECTS context below. Never make up a balance figure.

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

EXAMPLES (the dates below are illustrative placeholders, NEVER copy them
literally — always substitute the real date computed from the CURRENT
DATE AND TIME block in your context for whatever "{...}" describes):
User sets transport budget → end reply with: ACTION:SET_BUDGET:Transport:120000
User sets salary reminder for the 25th → end reply with: ACTION:SET_REMINDER:Pay staff salaries:{this or next month's 25th, from CURRENT DATE}:monthly
User says "Remind me 8:30pm today to pick up Jennifer" → end reply with: ACTION:SET_REMINDER:Pick up Jennifer:{today's date, from CURRENT DATE}:once:2030
User asks for PDF → end reply with: ACTION:EXPORT_PDF
User says "I sold 12 yards of Ankara today" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:-12:sale
User asks "What's my stock level?" → end reply with: ACTION:SHOW_INVENTORY
User says "Add 50 units of Ankara fabric at 2000 each" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:50:restock
User says "New client Marcus Adebayo" → end reply with: ACTION:START_CLIENT_SETUP:Marcus Adebayo
User says "Marcus paid me 150k" (Marcus is in client list) → end reply with: ACTION:LOG_PAYMENT:Marcus Adebayo:150000
User says "Generate an invoice for Marcus" → end reply with: ACTION:GENERATE_INVOICE
User asks "What's my estimated tax this month" → end reply with: ACTION:GET_TAX_ESTIMATE:Nigeria:this_month
User says "Remind me to pay VAT on the 21st, monthly" → end reply with: ACTION:SET_TAX_REMINDER:Pay VAT:{this or next month's 21st, from CURRENT DATE}:monthly
User says "Switch to Kenya" (in a tax context) → end reply with: ACTION:SWITCH_TAX_COUNTRY:Kenya
`

interface UserPermissions {
  canSeeClients: boolean
  canSeeIncome: boolean
  canExport: boolean
  isOwnerOrAdmin: boolean
}

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
  userPermissions?: UserPermissions
}

export async function getAIResponse(params: AIParams): Promise<{
  reply: string
  actions: string[]
}> {
  const { phoneNumber, orgId, orgName, userName, userMessage, currency, plan, defaultTaxCountry, scannedReceipt, userPermissions } = params

  // Role context block — tells the AI what this specific user is allowed to access
  const roleContext = userPermissions ? `
Current user permissions:
- Client/income data: ${userPermissions.canSeeClients ? 'YES — can discuss clients and income' : 'NO — do not discuss client folders or income with this user'}
- Export access: ${userPermissions.canExport ? 'YES' : 'NO'}
- Admin level: ${userPermissions.isOwnerOrAdmin ? 'Owner or Admin — full access' : 'Staff or limited role'}
If the user asks about clients, income, or projects and canSeeClients is NO, politely tell them their account doesn't have access to that information and they should ask their account owner.
` : ''

  // Load conversation history (last 10 exchanges = 20 messages)
  const history = await getConversationHistory(phoneNumber, 20)

  // Load financial context in parallel
  const [spending, budgets, reminders, allTaxRates, clients] = await Promise.all([
    getMonthlySpending(orgId),
    getBudgetStatus(orgId),
    getUpcomingReminders(orgId, 7),
    getAllTaxRates().catch(() => [] as any[]),
    userPermissions?.canSeeClients
      ? getClientsByOrg(orgId).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ])

  // Load projects for clients that have outstanding balances
  const clientsWithProjects: Array<{ client: any; projects: any[] }> = []
  if (clients.length > 0) {
    for (const client of clients.slice(0, 10)) {
      const projects = await getProjectsByClient(client.id).catch(() => [] as any[])
      clientsWithProjects.push({ client, projects })
    }
  }

  const taxCountry = TAX_COUNTRIES.includes(defaultTaxCountry as any) ? defaultTaxCountry : 'Nigeria'
  const ratesForDefaultCountry = allTaxRates.filter((r: any) => r.country === taxCountry)
  const defaultCountryEstimates = await Promise.all(
    ratesForDefaultCountry.map((r: any) =>
      calculateTaxEstimate({ orgId, country: taxCountry as any, taxType: r.tax_type, period: 'this_month', persist: false }).catch(() => null)
    )
  )

  const now = new Date()
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Grounds every date/time resolution the model does — computed fresh on
  // every single message (never cached, never hardcoded), in the user's
  // own local timezone derived from their phone's country code. This is
  // the fix for the bug where "today" resolved to a stale, wrong day: the
  // model was never told the real date and instead pattern-matched a
  // hardcoded example date left in this same prompt.
  const userTimezone = resolveTimezone(phoneNumber)
  const todayStr = dateStrInTimezone(userTimezone, now)
  const tomorrowStr = addDaysToDateStr(todayStr, 1)
  const yesterdayStr = addDaysToDateStr(todayStr, -1)
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, weekday: 'long' }).format(now)
  const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: true }).format(now)

  const contextBlock = `
[CURRENT DATE AND TIME — GROUND ALL DATE/TIME RESOLUTION ON THIS, NEVER GUESS OR COPY AN EXAMPLE DATE FROM YOUR INSTRUCTIONS]
Right now it is ${dayName}, ${todayStr}, ${timeStr} (${userTimezone}).
"today" = ${todayStr}
"tomorrow" = ${tomorrowStr}
"yesterday" = ${yesterdayStr}
Compute any other relative date (e.g. "next Friday", "in 3 days", "the 25th") starting from ${todayStr} above — never from memory, training data, or any date shown elsewhere in these instructions.

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

ACTIVE CLIENTS:
${clientsWithProjects.length > 0
    ? clientsWithProjects.map(({ client, projects }) => {
      const projectLines = projects.length > 0
        ? projects.map((p: any) => {
          const bal = p.balance_due != null ? ` — ${currency} ${Number(p.balance_due).toLocaleString()} remaining` : ''
          const deadline = p.deadline ? ` (due ${p.deadline})` : ''
          return `  ↳ ${p.name} [${p.status}]${deadline}${bal}`
        }).join('\n')
        : '  ↳ No active projects'
      const outstanding = client.outstanding_balance > 0
        ? ` | outstanding ${currency} ${Number(client.outstanding_balance).toLocaleString()}`
        : ''
      return `• ${client.name} — received ${currency} ${Number(client.total_earned).toLocaleString()}${outstanding}\n${projectLines}`
    }).join('\n')
    : '• No active clients yet. User can create one by saying "New client [name]".'
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
    system: roleContext ? `${SYSTEM_PROMPT}\n\n${roleContext}` : SYSTEM_PROMPT,
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
