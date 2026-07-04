# Phase 1 — WhatsApp Bot (Conversational AI Assistant)
> Read CLAUDE.md first — it contains the full schema, env vars, and rules.
> This is Phase 1. Build this first before the web app or mobile app.

---

## What This Is

A conversational AI financial assistant that lives inside WhatsApp.
Not just a receipt scanner — a smart financial assistant that:

- Scans receipt photos and gives context-aware commentary
- Answers any financial question in natural language
- Manages budgets through conversation
- Sets and fires reminders for bills, taxes, salaries, deadlines
- Gives honest feedback on spending habits and overspending
- Supports Nigerian Pidgin English automatically
- Remembers the full conversation history per user

---

## Folder Structure

```
/bot
  /src
    index.ts              ← Express server, single route POST /webhook/whatsapp
    webhook.ts            ← Receives Twilio POST, verifies signature, calls handler
    message-handler.ts    ← Routes image vs text, calls AI, sends reply
    ai-assistant.ts       ← Core Claude conversational engine with financial context
    conversation.ts       ← Load/save WhatsApp chat history from Supabase
    receipt-scanner.ts    ← Claude Vision — extract data from receipt image
    action-executor.ts    ← Executes actions Claude detects (SET_BUDGET, SET_REMINDER)
    budget-service.ts     ← Create, update, read budgets + calculate % used
    reminder-service.ts   ← Create reminders, fire due ones, advance recurring dates
    report-service.ts     ← Monthly/weekly spending summaries for context + reports
    pdf-generator.ts      ← Generate PDF report, upload to Supabase Storage
    scheduler.ts          ← node-cron jobs: reminders, weekly summary, monthly report
    user-service.ts       ← getOrCreateUser by phone number
    twiml-builder.ts      ← Build Twilio TwiML XML response strings
    auth.ts               ← Verify Twilio webhook signature (security)
    supabase.ts           ← Supabase client singleton
  /types
    index.ts              ← All shared TypeScript interfaces
  .env                    ← Never commit. See CLAUDE.md for variable names.
  package.json
  tsconfig.json
```

---

## How Every Message Is Handled

```
User sends WhatsApp message (photo or text)
              ↓
POST /webhook/whatsapp  (Twilio sends this to our server)
              ↓
auth.ts — verify Twilio signature (reject if invalid)
              ↓
user-service.ts — getOrCreateUser(phoneNumber)
              ↓
Check subscription + receipt limit (free tier = 10/month)
              ↓
         Is it an image?
        YES          NO
         ↓            ↓
   receipt-scanner  (skip scan)
   (Claude Vision)
         ↓            ↓
         └─────┬──────┘
               ↓
   ai-assistant.ts — build context + call Claude:
   • Last 10 conversation messages (memory)
   • This month spending summary
   • All budgets + % used
   • Upcoming reminders (next 7 days)
   • Receipt just scanned (if image)
   • User name, org name, plan, currency
               ↓
   Claude generates natural language reply
   + optional hidden ACTION tags
               ↓
   action-executor.ts — execute any actions:
   SET_BUDGET → budget-service.ts
   SET_REMINDER → reminder-service.ts
   EXPORT_PDF → pdf-generator.ts
               ↓
   conversation.ts — save exchange to Supabase
               ↓
   twiml-builder.ts — send reply to user
```

---

## ai-assistant.ts — Full Implementation

```typescript
// ai-assistant.ts
// Core conversational AI engine.
// Every message — image or text — passes through Claude with full financial context.
// Claude replies naturally and includes hidden ACTION tags for budget/reminder changes.

import Anthropic from '@anthropic-ai/sdk'
import { getMonthlySpending, getBudgetStatus } from './report-service'
import { getUpcomingReminders } from './reminder-service'
import { getConversationHistory, saveMessage } from './conversation'

const claude = new Anthropic()

const SYSTEM_PROMPT = `
You are TrueFlow, a friendly and honest WhatsApp financial assistant for small
business owners. You help them track expenses, manage budgets, set reminders,
and understand their finances.

SCOPE BOUNDARY — READ THIS FIRST, IT OVERRIDES EVERYTHING ELSE BELOW:
You ONLY help with these specific tasks: scanning and logging receipts,
tracking expenses, managing client payments and projects, setting and
checking budgets, setting and checking reminders, and answering questions
about the user's OWN financial data already stored in TrueFlow.

You do NOT answer general knowledge questions, give investment or legal
advice, write code, explain unrelated topics, or engage in open-ended
conversation of any kind, even if the user asks nicely or rephrases the
request. This is a hard rule, not a tone preference, and it is non-negotiable
for platform compliance reasons, not just product design.

If a message falls outside this scope, respond with this exact pattern,
clearly and politely, every time, with no exceptions:
"I'm built specifically to help you track receipts, budgets, clients, and
reminders. I can't help with [brief restatement], but here's what I can do:
[one relevant suggestion based on their account]."

Never attempt to partially answer an out-of-scope question before redirecting.
Never apologize excessively or explain the policy reason to the user, just
redirect cleanly and warmly, the same way you would naturally say "that's
not something I handle" without making it sound like a legal disclaimer.

YOUR PERSONALITY (applies only WITHIN the scope above):
- Warm and conversational — like a smart friend who happens to be an accountant
- Honest — if they are overspending, say so clearly but kindly
- Proactive — spot problems before they become serious
- Concise — WhatsApp messages should be short. Max 5-6 lines per reply.
- Use emojis sparingly — only ✅ ⚠️ 📊 💰 🔴 🟡 where they add real clarity
- Use *bold* for numbers and key points (WhatsApp markdown)
- Never use dashes for bullet points — use • instead
- Within scope, never say "I cannot" — always find a helpful way to respond
- If user writes in Nigerian Pidgin English, reply in Pidgin too

Note the distinction: "never say I cannot" applies to in-scope financial
tasks (e.g. a confusing budget request), where you should always find a
helpful path forward. It does NOT apply to out-of-scope requests, where the
clear redirect above is the correct and required response, not a failure
to be helpful around.

ACTIONS:
When the user wants to set a budget, set a reminder, or export a PDF,
include the relevant ACTION tag on a new line at the very end of your reply.
The user never sees ACTION tags — they are stripped before sending.

Available actions:
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:EXPORT_PDF
ACTION:SHOW_BUDGETS

recurrence values: once | daily | weekly | monthly | yearly

EXAMPLES:
User sets transport budget → end reply with: ACTION:SET_BUDGET:Transport:120000
User sets salary reminder → end reply with: ACTION:SET_REMINDER:Pay staff salaries:2025-06-25:monthly
User asks for PDF → end reply with: ACTION:EXPORT_PDF
User asks "what's the weather today" → out-of-scope redirect, no ACTION tag
User asks "write me a poem" → out-of-scope redirect, no ACTION tag
`

interface AIParams {
  phoneNumber: string
  orgId: string
  orgName: string
  userName: string
  userMessage: string
  currency: string
  plan: string
  scannedReceipt?: any
}

export async function getAIResponse(params: AIParams): Promise<{
  reply: string
  actions: string[]
}> {
  const { phoneNumber, orgId, orgName, userName, userMessage, currency, plan, scannedReceipt } = params

  // Load conversation history (last 10 exchanges = 20 messages)
  const history = await getConversationHistory(phoneNumber, 20)

  // Load financial context in parallel
  const [spending, budgets, reminders] = await Promise.all([
    getMonthlySpending(orgId),
    getBudgetStatus(orgId),
    getUpcomingReminders(orgId, 7)
  ])

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
```

---

## conversation.ts — Memory Per User

```typescript
// conversation.ts
// Loads and saves WhatsApp conversation history per phone number.
// Keeps last 50 messages. Claude uses this as memory.

import { supabase } from './supabase'

export async function getConversationHistory(phoneNumber: string, limit = 20) {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('role, content')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) console.error('getConversationHistory failed:', error)
  return (data || []).reverse().map(m => ({ role: m.role, content: m.content }))
}

export async function saveMessage(phoneNumber: string, role: 'user' | 'assistant', content: string) {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .insert({ phone_number: phoneNumber, role, content })

  if (error) console.error('saveMessage failed:', error)

  // Trim to last 50 messages
  const { data: old } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .range(50, 9999)

  if (old && old.length > 0) {
    await supabase
      .from('whatsapp_conversations')
      .delete()
      .in('id', old.map((r: any) => r.id))
  }
}
```

---

## action-executor.ts — Execute Claude's Detected Actions

```typescript
// action-executor.ts
// Parses and executes action strings Claude includes at the end of its replies.
// e.g. "SET_BUDGET:Transport:120000" → writes budget to Supabase

import { setBudget } from './budget-service'
import { setReminder } from './reminder-service'
import { generateAndSendPDF } from './pdf-generator'

export async function executeActions(actions: string[], user: any) {
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
        default:
          break
      }
    } catch (err) {
      console.error(`executeAction ${type} failed:`, err)
    }
  }
}
```

---

## reminder-service.ts — Create and Fire Reminders

```typescript
// reminder-service.ts
// Manages reminders: create, list upcoming, fire due ones, reschedule recurring.

import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'
import { getAIResponse } from './ai-assistant'

export async function setReminder(params: {
  orgId: string
  title: string
  dueDate: string
  recurrence: string
  category?: string
}) {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      org_id: params.orgId,
      title: params.title,
      due_date: params.dueDate,
      recurrence: params.recurrence,
      category: params.category || 'custom'
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getUpcomingReminders(orgId: string, daysAhead: number) {
  const today = new Date().toISOString().split('T')[0]
  const future = new Date()
  future.setDate(future.getDate() + daysAhead)
  const futureStr = future.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .gte('due_date', today)
    .lte('due_date', futureStr)
    .order('due_date', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

// Called by scheduler every morning at 8am WAT
export async function fireDueReminders() {
  const today = new Date().toISOString().split('T')[0]

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select(`*, organizations(id, name, currency, org_members(whatsapp_number, role))`)
    .eq('due_date', today)
    .eq('status', 'active')

  if (error) { console.error('fireDueReminders query failed:', error); return }

  for (const reminder of reminders || []) {
    const owner = reminder.organizations?.org_members?.find((m: any) => m.role === 'owner')
    if (!owner?.whatsapp_number) continue

    const message = `🔔 *Reminder: ${reminder.title}*\n\nThis is due today. Reply if you need help tracking this expense.`
    await sendWhatsAppMessage(owner.whatsapp_number, message)

    if (reminder.recurrence === 'once') {
      await supabase.from('reminders').update({ status: 'fired', fired_at: new Date() }).eq('id', reminder.id)
    } else {
      await supabase.from('reminders').update({ due_date: getNextDate(reminder.due_date, reminder.recurrence) }).eq('id', reminder.id)
    }
  }
}

// Called by scheduler 3 days before due date
export async function fireAdvanceReminders() {
  const target = new Date()
  target.setDate(target.getDate() + 3)
  const targetStr = target.toISOString().split('T')[0]

  const { data: reminders } = await supabase
    .from('reminders')
    .select(`*, organizations(org_members(whatsapp_number, role))`)
    .eq('due_date', targetStr)
    .eq('status', 'active')

  for (const reminder of reminders || []) {
    const owner = reminder.organizations?.org_members?.find((m: any) => m.role === 'owner')
    if (!owner?.whatsapp_number) continue

    const message = `⏰ *Upcoming in 3 days: ${reminder.title}*\n\nDue on ${reminder.due_date}. Want me to help you prepare?`
    await sendWhatsAppMessage(owner.whatsapp_number, message)
  }
}

function getNextDate(current: string, recurrence: string): string {
  const date = new Date(current)
  switch (recurrence) {
    case 'daily':   date.setDate(date.getDate() + 1); break
    case 'weekly':  date.setDate(date.getDate() + 7); break
    case 'monthly': date.setMonth(date.getMonth() + 1); break
    case 'yearly':  date.setFullYear(date.getFullYear() + 1); break
  }
  return date.toISOString().split('T')[0]
}
```

---

## scheduler.ts — All Automated Jobs

```typescript
// scheduler.ts
// All cron jobs. Call startScheduler() from index.ts on server startup.

import cron from 'node-cron'
import { fireDueReminders, fireAdvanceReminders } from './reminder-service'
import { sendWeeklySummaries, sendMonthlyReports } from './report-service'
import { checkBudgetAlerts } from './budget-service'

export function startScheduler() {
  // Fire due reminders — every day 8am WAT (7am UTC)
  cron.schedule('0 7 * * *', () => fireDueReminders())

  // Fire 3-day advance warnings — every day 8am WAT
  cron.schedule('0 7 * * *', () => fireAdvanceReminders())

  // Weekly summary — every Sunday 8am WAT
  cron.schedule('0 7 * * 0', () => sendWeeklySummaries())

  // Monthly report — 1st of month 9am WAT (8am UTC)
  cron.schedule('0 8 1 * *', () => sendMonthlyReports())

  // Budget alert check — every hour
  cron.schedule('0 * * * *', () => checkBudgetAlerts())

  console.log('TrueFlow scheduler running ✅')
}
```

---

## Reminder Types TrueFlow Handles Via Chat

| User says | Category | Recurrence |
|-----------|----------|-----------|
| "Remind me to pay VAT on the 21st every month" | tax | monthly |
| "Alert me when it's time to pay salaries" | salary | monthly |
| "Remind me to reorder stock next Friday" | operations | once |
| "Remind me about PAYE every 10th" | tax | monthly |
| "Remind me to renew my CAC certificate in December" | compliance | yearly |
| "Remind me to pay rent on the 1st" | bill | monthly |
| "Tell me 3 days before my EKEDC bill is due" | bill | monthly |

---

## Package.json

```json
{
  "name": "trueflow-bot",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "@supabase/supabase-js": "latest",
    "axios": "latest",
    "express": "latest",
    "node-cron": "latest",
    "twilio": "latest",
    "dotenv": "latest"
  },
  "devDependencies": {
    "@types/express": "latest",
    "@types/node": "latest",
    "@types/node-cron": "latest",
    "ts-node": "latest",
    "typescript": "latest"
  }
}
```

---

## Build Order — Do These In Order

1. Create Supabase tables (run schema from CLAUDE.md in Supabase SQL editor)
2. `package.json` + `tsconfig.json` + `.env`
3. `supabase.ts` — Supabase client
4. `twiml-builder.ts` — build TwiML XML responses
5. `auth.ts` — verify Twilio signature
6. `user-service.ts` — getOrCreateUser(phoneNumber)
7. `conversation.ts` — history load/save
8. `receipt-scanner.ts` — Claude Vision extraction
9. `report-service.ts` — getMonthlySpending, getBudgetStatus
10. `ai-assistant.ts` — core Claude engine
11. `budget-service.ts` — setBudget, getBudgetStatus
12. `reminder-service.ts` — setReminder, fireDueReminders
13. `action-executor.ts` — execute AI-detected actions
14. `message-handler.ts` — orchestrate the full flow
15. `webhook.ts` — Twilio POST handler
16. `index.ts` — Express server entry point
17. `pdf-generator.ts` — PDF export
18. `scheduler.ts` — all cron jobs
19. Deploy to Railway

---

## First Claude Code Prompt to Use

Paste this into Claude Code to start:

> "Read CLAUDE.md and docs/whatsapp-bot.md.
> Create the /bot folder structure and package.json.
> Then build these files in order:
> supabase.ts, twiml-builder.ts, auth.ts, user-service.ts,
> conversation.ts, receipt-scanner.ts, report-service.ts,
> ai-assistant.ts, budget-service.ts, reminder-service.ts,
> action-executor.ts, message-handler.ts, webhook.ts, index.ts."

---

## Smart Transfer Recognition — WhatsApp Bot Implementation

### Overview
When a client sends payment proof to the SME owner via WhatsApp or Instagram,
the owner forwards that screenshot to the TrueFlow WhatsApp bot number.
The bot reads it, identifies the client, logs the income, and updates everything.

This is one of TrueFlow's most powerful features for Nigerian SMEs.
It turns forwarded payment screenshots into tracked income records automatically.

### New Files to Build

```
/bot/src
  transfer-detector.ts       ← Determines if image is incoming payment vs expense
  bank-reader.ts             ← Nigerian bank-specific extraction and parsing
```

### transfer-detector.ts

```typescript
// transfer-detector.ts
// First step when any image arrives at the bot.
// Determines whether the image is:
// 1. An incoming client payment (MONEY IN) → route to Smart Transfer Recognition
// 2. An outgoing expense receipt (MONEY OUT) → route to receipt scanner
// 3. Unknown → ask the owner which it is

import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic()

const DETECTION_PROMPT = `
You are reading an image sent to a Nigerian business owner.
Determine what type of financial document this is.
Return ONLY valid JSON:
{
  "type": "incoming_payment" | "expense_receipt" | "invoice" | "unknown",
  "confidence": "high" | "medium" | "low",
  "reason": "one sentence explaining your determination"
}

INCOMING PAYMENT signals (client paid the owner):
- "Credit alert", "You have received", "Inflow", "CR"
- "Transfer credit", "Payment received", "Successfully received"
- Bank credit notification, payment confirmation to the recipient

EXPENSE RECEIPT signals (owner paid someone):
- "Debit alert", "You have paid", "DR", "POS purchase"
- "Transfer debit", "Payment made", "Receipt for purchase"
- Shop receipt, vendor invoice, utility bill

INVOICE: a document requesting payment (has due date, line items)
UNKNOWN: cannot determine from the image
`

export async function detectImageType(base64: string, mediaType: string): Promise<{
  type: 'incoming_payment' | 'expense_receipt' | 'invoice' | 'unknown'
  confidence: string
  reason: string
}> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: base64 } },
        { type: 'text', text: DETECTION_PROMPT }
      ]
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    return JSON.parse(text)
  } catch {
    return { type: 'unknown', confidence: 'low', reason: 'Could not parse image' }
  }
}
```

### bank-reader.ts

```typescript
// bank-reader.ts
// Reads Nigerian bank transfer screenshots and extracts structured payment data.
// Called after transfer-detector confirms the image is an incoming payment.

import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic()

const BANK_READER_PROMPT = `
You are reading a Nigerian bank transfer screenshot or payment confirmation.
Extract ALL visible payment information. Return ONLY valid JSON, no markdown:
{
  "amount": number (e.g. 150000.00),
  "currency": "NGN",
  "sender_name": "full name as shown on screenshot or null",
  "recipient_name": "null (this is the business owner receiving)",
  "bank": "bank name e.g. GTBank, Access Bank, Opay, Palmpay etc or null",
  "payment_reference": "transaction reference number or null",
  "transaction_id": "session ID or transaction ID or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "narration": "payment narration/description or null",
  "account_last4": "last 4 digits of sender account or null",
  "confidence": "high | medium | low"
}

Nigerian banks and payment apps to recognise:
GTBank, Access Bank, Zenith Bank, UBA, First Bank, Opay, Palmpay,
Moniepoint, Kuda, Stanbic IBTC, Sterling Bank, Wema Bank, FCMB,
Polaris Bank, Union Bank, Providus Bank, Jaiz Bank, Carbon, Fairmoney.

Extract sender_name exactly as printed — do not clean or reformat it.
If amount shows commas (e.g. 150,000.00) convert to number (150000.00).
`

export interface TransferData {
  amount: number
  currency: string
  sender_name: string | null
  bank: string | null
  payment_reference: string | null
  transaction_id: string | null
  date: string | null
  time: string | null
  narration: string | null
  account_last4: string | null
  confidence: string
}

export async function readBankTransfer(base64: string, mediaType: string): Promise<TransferData> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: base64 } },
        { type: 'text', text: BANK_READER_PROMPT }
      ]
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Could not read payment screenshot — please try a clearer image')
  }
}
```

### smart-transfer-service.ts

```typescript
// smart-transfer-service.ts
// Orchestrates the full Smart Transfer Recognition flow:
// 1. Read bank screenshot
// 2. Find or create client
// 3. Log payment to Supabase
// 4. Update client balance and project

import { supabase } from './supabase'
import { readBankTransfer, TransferData } from './bank-reader'
import { uploadImage } from './storage'

export async function findClientMatch(orgId: string, senderName: string | null) {
  if (!senderName) return null

  // Try exact match first
  const { data: exact } = await supabase
    .from('clients')
    .select('id, name, outstanding_balance, total_earned')
    .eq('org_id', orgId)
    .ilike('name', senderName)
    .single()

  if (exact) return { match: 'exact', client: exact }

  // Try partial match — any word in sender_name matches
  const words = senderName.split(' ').filter(w => w.length > 2)
  for (const word of words) {
    const { data: partial } = await supabase
      .from('clients')
      .select('id, name, outstanding_balance, total_earned')
      .eq('org_id', orgId)
      .ilike('name', `%${word}%`)
      .limit(3)

    if (partial && partial.length > 0) {
      return { match: 'partial', clients: partial }
    }
  }

  return null
}

export async function logClientPayment(params: {
  orgId: string
  clientId: string
  projectId?: string
  transfer: TransferData
  imageUrl: string
}) {
  const { orgId, clientId, projectId, transfer, imageUrl } = params

  // 1. Insert client payment record
  const { data: payment, error } = await supabase
    .from('client_payments')
    .insert({
      org_id: orgId,
      client_id: clientId,
      project_id: projectId || null,
      amount: transfer.amount,
      currency: transfer.currency || 'NGN',
      payment_type: 'transfer',
      payment_date: transfer.date || new Date().toISOString().split('T')[0],
      payment_reference: transfer.payment_reference || transfer.transaction_id,
      receipt_image_url: imageUrl,
      ai_transcript: JSON.stringify(transfer),
      notes: `${transfer.bank || 'Bank'} transfer · Sender: ${transfer.sender_name}`
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // 2. Update client totals
  await supabase.rpc('increment_client_earned', {
    p_client_id: clientId,
    p_amount: transfer.amount
  })

  // 3. Update project if linked
  if (projectId) {
    await supabase.rpc('increment_project_received', {
      p_project_id: projectId,
      p_amount: transfer.amount
    })
  }

  return payment
}
```

### Updated message-handler.ts Flow for Smart Transfer Recognition

```typescript
// In message-handler.ts — updated image routing logic

if (hasImage && mediaUrl) {
  // Step 1: Download image
  const { base64, mediaType } = await downloadImage(mediaUrl)

  // Step 2: Detect image type FIRST
  const detection = await detectImageType(base64, mediaType)

  if (detection.type === 'incoming_payment') {
    // SMART TRANSFER RECOGNITION FLOW
    const transfer = await readBankTransfer(base64, mediaType)
    const imageUrl = await uploadImage(base64, `client-receipts/${user.org_id}`)
    const match = await findClientMatch(user.org_id, transfer.sender_name)

    // Build context for AI with transfer data + match result
    const { reply, actions } = await getAIResponse({
      ...params,
      userMessage: '[Owner forwarded a client payment screenshot]',
      incomingTransfer: transfer,
      clientMatch: match
    })

    await executeActions(actions, user)
    return buildTwiML(buildReply(reply))

  } else if (detection.type === 'expense_receipt') {
    // EXISTING EXPENSE RECEIPT FLOW
    const receipt = await scanReceiptImage(mediaUrl, user)
    // ... existing flow

  } else {
    // UNKNOWN — ask owner
    const { reply } = await getAIResponse({
      ...params,
      userMessage: '[Owner sent an image — type unclear]',
      unknownImage: true
    })
    return buildTwiML(buildReply(reply))
  }
}
```

### Bot Reply Templates for Smart Transfer Recognition

**Exact client match found:**
```
📥 *Payment received!*

💰 ₦150,000 from *Marcus Adebayo*
🏦 GTBank · 14 June 2025
🔖 Ref: FT25067382910

I found Marcus Adebayo in your clients.
Outstanding balance: ₦300,000

Which project is this for?
1️⃣ Website design (₦300,000 remaining)
2️⃣ Logo & branding (₦50,000 remaining)
3️⃣ General payment — no project
```

**Partial match found:**
```
📥 *Payment received!*

💰 ₦150,000 from *MARCUS A VENTURES*
🏦 Access Bank · 14 June 2025

I found a possible match. Is this one of these?
1️⃣ Marcus Adebayo
2️⃣ Marcus & Associates Ltd
3️⃣ None of these — new client
```

**No match — new client:**
```
📥 *Payment received!*

💰 ₦150,000 from *JENNIFER OKAFOR*
🏦 Opay · 14 June 2025

I don't have a client called Jennifer Okafor.

Reply *NEW* to create her client folder
Reply *SKIP* to log without a client
```

**After logging — confirmation:**
```
✅ *Payment logged!*

Client: Marcus Adebayo
Project: Website design
Amount: ₦150,000 received
Balance remaining: ₦150,000

Invoice updated. Your web dashboard
and mobile app have been updated.

Reply INVOICE to send Marcus an updated
receipt or CLIENTS to see all balances.
```

### Supabase RPC Functions Needed

```sql
-- Add these to Supabase SQL editor

-- Increment client total earned
create or replace function increment_client_earned(
  p_client_id uuid,
  p_amount numeric
) returns void as $$
begin
  update clients
  set
    total_earned = total_earned + p_amount,
    outstanding_balance = greatest(0, outstanding_balance - p_amount),
    updated_at = now()
  where id = p_client_id;
end;
$$ language plpgsql security definer;

-- Increment project amount received
create or replace function increment_project_received(
  p_project_id uuid,
  p_amount numeric
) returns void as $$
begin
  update projects
  set
    amount_received = amount_received + p_amount,
    updated_at = now()
  where id = p_project_id;
  -- balance_due auto-updates (generated column)
end;
$$ language plpgsql security definer;
```

### Build Order for Smart Transfer Recognition in Bot

1. Add SQL RPC functions to Supabase
2. Build `transfer-detector.ts`
3. Build `bank-reader.ts`
4. Build `smart-transfer-service.ts`
5. Update `message-handler.ts` — add detection routing
6. Update `ai-assistant.ts` — add `incomingTransfer` context block
7. Update `action-executor.ts` — add `CREATE_CLIENT_PAYMENT`, `MATCH_CLIENT` actions
8. Test with real GTBank, Access, Opay screenshots

---

## Seamless Onboarding Implementation

### Overview
The bot must handle three states for every incoming user: brand new (no
profile exists), mid-onboarding (profile exists but Q1/Q2 not answered yet),
and fully onboarded (normal AI assistant flow applies).

### onboarding-service.ts

```typescript
// onboarding-service.ts
// Tracks where a user is in the onboarding flow and returns the next
// appropriate bot message. Onboarding state lives on the organizations
// and whatsapp_sessions tables, no separate state machine table needed.

import { supabase } from './supabase'

export type OnboardingStep = 'new' | 'awaiting_name' | 'awaiting_type' | 'awaiting_first_receipt' | 'complete'

export async function getOnboardingStep(orgId: string, isNew: boolean): Promise<OnboardingStep> {
  if (isNew) return 'new'

  const { data: org } = await supabase
    .from('organizations')
    .select('name, type')
    .eq('id', orgId)
    .single()

  if (!org || org.name === 'Unnamed') return 'awaiting_name'
  if (!org.type) return 'awaiting_type'

  const { count } = await supabase
    .from('receipts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (!count || count === 0) return 'awaiting_first_receipt'

  return 'complete'
}

export async function handleOnboardingReply(
  step: OnboardingStep,
  orgId: string,
  userMessage: string
): Promise<string> {
  switch (step) {
    case 'new':
      // Create placeholder org happens in user-service.ts getOrCreateUser
      return `👋 Welcome to TrueFlow!

I'm your AI assistant for tracking money, in and out.

Before we start, what should I call your business? (Or just your name if this is personal.)`

    case 'awaiting_name':
      await supabase
        .from('organizations')
        .update({ name: userMessage.trim() })
        .eq('id', orgId)

      return `Got it, ${userMessage.trim()} ✅

Quick one, is this for:
1️⃣ My business
2️⃣ My family
3️⃣ Just me, personal`

    case 'awaiting_type': {
      const typeMap: Record<string, string> = { '1': 'sme', '2': 'family', '3': 'individual' }
      const type = typeMap[userMessage.trim()] || 'sme'

      await supabase
        .from('organizations')
        .update({ type })
        .eq('id', orgId)

      return `Perfect. Last thing, send me a photo of any receipt, or a payment screenshot a client sent you. I'll show you exactly what I can do.`
    }

    case 'awaiting_first_receipt':
      return `Send me a photo of any receipt or payment screenshot to get started 📷`

    default:
      return ''
  }
}
```

### Updated user-service.ts — getOrCreateUser

```typescript
// user-service.ts
// Creates the full chain (profile, organization, org_member) on the
// very first message, with a placeholder name. The onboarding-service
// fills in real details conversationally.

import { supabase } from './supabase'

export async function getOrCreateUser(phoneNumber: string) {
  const { data: existing } = await supabase
    .from('whatsapp_sessions')
    .select('*, organizations(*)')
    .eq('phone_number', phoneNumber)
    .single()

  if (existing) {
    return { ...existing, is_new: false }
  }

  // First contact ever, create the full chain immediately
  const { data: profile } = await supabase
    .from('profiles')
    .insert({ phone: phoneNumber })
    .select()
    .single()

  const { data: org } = await supabase
    .from('organizations')
    .insert({
      name: 'Unnamed',
      type: null,
      owner_id: profile!.id,
      plan: 'free'
    })
    .select()
    .single()

  await supabase
    .from('org_members')
    .insert({
      org_id: org!.id,
      user_id: profile!.id,
      role: 'owner',
      whatsapp_number: phoneNumber,
      joined_at: new Date()
    })

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .insert({
      phone_number: phoneNumber,
      org_id: org!.id,
      user_id: profile!.id,
      is_new: true
    })
    .select()
    .single()

  return { ...session, organizations: org, is_new: true }
}
```

### Updated message-handler.ts — Onboarding Gate

```typescript
// message-handler.ts
// Onboarding check happens BEFORE normal AI assistant routing.
// If onboarding is incomplete, the bot stays focused on finishing it
// rather than processing unrelated commands.

import { getOrCreateUser } from './user-service'
import { getOnboardingStep, handleOnboardingReply } from './onboarding-service'
import { getAIResponse } from './ai-assistant'
import { buildTwiML, buildReply } from './twiml-builder'

export async function handleIncomingMessage(msg: {
  phoneNumber: string
  body: string
  hasImage: boolean
  mediaUrl?: string
}) {
  const user = await getOrCreateUser(msg.phoneNumber)
  const step = await getOnboardingStep(user.org_id, user.is_new)

  if (step !== 'complete') {
    // Special case: if awaiting_first_receipt and an image just arrived,
    // let it fall through to the normal receipt scanning flow so the
    // first scan IS the onboarding completion moment.
    if (step === 'awaiting_first_receipt' && msg.hasImage) {
      // fall through to normal flow below
    } else {
      const reply = await handleOnboardingReply(step, user.org_id, msg.body || '')
      return buildTwiML(buildReply(reply))
    }
  }

  // Normal AI assistant flow continues here for fully onboarded users
  // and for the first-receipt-during-onboarding case
  // ... existing logic from ai-assistant.ts
}
```

### Staff Onboarding via Team Invite

```typescript
// Triggered when an owner invites a staff member from the web app.
// Sends an immediate WhatsApp welcome, no separate signup flow.

export async function sendStaffWelcome(phoneNumber: string, orgName: string) {
  const message = `👋 Hi! ${orgName} has added you to their TrueFlow team.

Send me photos of receipts and I'll log them straight to the business account.

Reply START to begin.`

  await sendWhatsAppMessage(phoneNumber, message)

  // Create org_members row immediately, whatsapp_active = true
  // Staff member does not go through the owner onboarding flow
  // (no business name question, no type question, already known)
}
```

### Build Order for Onboarding

1. Add `otp_codes` table to Supabase
2. Build `onboarding-service.ts`
3. Update `user-service.ts` — `getOrCreateUser()` creates full chain on
   first contact
4. Update `message-handler.ts` — add onboarding gate before normal routing
5. Update staff invite flow to send immediate WhatsApp welcome
6. Test full flow end to end with a fresh phone number

---

## Inventory Tracking — WhatsApp Bot Implementation

### inventory-service.ts

```typescript
// inventory-service.ts
// Creates and manages inventory items and stock movements.
// Called by action-executor when the AI detects inventory intent.
// Always requires explicit owner confirmation before any stock change.

import { supabase } from './supabase'

export async function getInventoryItems(orgId: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getLowStockItems(orgId: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .filter('quantity_on_hand', 'lte', 'low_stock_threshold')
  if (error) throw new Error(error.message)
  return data || []
}

export async function addInventoryItem(params: {
  orgId: string
  name: string
  quantity: number
  unitCost?: number
  unitPrice?: number
  sku?: string
  category?: string
}) {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      org_id: params.orgId,
      name: params.name,
      quantity_on_hand: params.quantity,
      unit_cost: params.unitCost || null,
      unit_price: params.unitPrice || null,
      sku: params.sku || null,
      category: params.category || null
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateStock(params: {
  orgId: string
  itemId: string
  quantityChange: number
  changeType: 'restock' | 'sale' | 'adjustment'
  referenceType?: string
  referenceId?: string
  notes?: string
  createdBy?: string
}) {
  const { error } = await supabase.rpc('update_inventory_stock', {
    p_item_id: params.itemId,
    p_quantity_change: params.quantityChange,
    p_change_type: params.changeType,
    p_reference_type: params.referenceType || null,
    p_reference_id: params.referenceId || null,
    p_notes: params.notes || null,
    p_created_by: params.createdBy || null
  })
  if (error) throw new Error(error.message)

  // Check for low stock after every sale
  if (params.changeType === 'sale') {
    await checkAndAlertLowStock(params.orgId, params.itemId)
  }
}

async function checkAndAlertLowStock(orgId: string, itemId: string) {
  const { data: item } = await supabase
    .from('inventory_items')
    .select('name, quantity_on_hand, low_stock_threshold')
    .eq('id', itemId)
    .single()

  if (!item) return
  if (item.quantity_on_hand <= item.low_stock_threshold) {
    // Create a restock reminder using the existing reminder-service
    const { setReminder } = await import('./reminder-service')
    await setReminder({
      orgId,
      title: `Restock ${item.name} — only ${item.quantity_on_hand} units left`,
      dueDate: new Date().toISOString().split('T')[0],
      recurrence: 'once',
      category: 'operations'
    })
  }
}
```

### Updated action-executor.ts — Inventory and Guided Client Setup Actions

Add these cases to the existing switch statement in action-executor.ts:

```typescript
case 'UPDATE_INVENTORY': {
  // UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
  const [, itemName, quantityChange, changeType] = action.split(':')
  const items = await getInventoryItems(user.org_id)
  const item = items.find(i => i.name.toLowerCase() === itemName.toLowerCase())

  if (item) {
    await updateStock({
      orgId: user.org_id,
      itemId: item.id,
      quantityChange: parseFloat(quantityChange),
      changeType: changeType as 'restock' | 'sale' | 'adjustment',
      createdBy: user.user_id
    })
  } else if (parseFloat(quantityChange) > 0) {
    // New item, add it with opening stock
    await addInventoryItem({
      orgId: user.org_id,
      name: itemName,
      quantity: parseFloat(quantityChange)
    })
  }
  break
}

case 'GENERATE_INVOICE': {
  // GENERATE_INVOICE:{clientId}:{projectId}
  const [, clientId, projectId] = action.split(':')
  // Invoice creation already handled in invoice-service.ts
  // This action just triggers it explicitly from the AI
  break
}

case 'START_CLIENT_SETUP': {
  // Triggers the guided conversational client creation flow
  // This sets a session-level flag so the next messages from this
  // user are routed to client-setup-service.ts instead of the normal
  // AI assistant flow until the flow completes or the user exits
  const [, clientName] = action.split(':')
  await startGuidedClientSetup(user.org_id, user.phone_number, clientName)
  break
}
```

### Updated ai-assistant.ts System Prompt Additions

Add these lines to the ACTIONS section of SYSTEM_PROMPT (in addition
to all existing actions, not replacing them):

```
ACTION:UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
  Use for: user mentions selling units, restocking, or stock adjustment
  changeType: restock (positive qty) | sale (negative qty) | adjustment
  ALWAYS confirm with user before emitting this action

ACTION:GENERATE_INVOICE:{clientId}:{projectId}
  Use ONLY when user explicitly asks to generate or send an invoice
  Never auto-trigger at client creation, only on explicit request

ACTION:START_CLIENT_SETUP:{clientName}
  Use when user says "new client", "add client", or clearly describes
  starting a relationship with a new business contact
```

Also add inventory context to the financial context block injected on
every message, so the AI knows current stock levels when a user asks:

```typescript
// In getAIResponse(), add to contextBlock:
const [spending, budgets, reminders, lowStock] = await Promise.all([
  getMonthlySpending(orgId),
  getBudgetStatus(orgId),
  getUpcomingReminders(orgId, 7),
  getLowStockItems(orgId)   // ← new
])

// Add to contextBlock string:
`INVENTORY (low stock alerts only):
${lowStock.length > 0
  ? lowStock.map((i: any) => `• ${i.name}: ${i.quantity_on_hand} units left (threshold: ${i.low_stock_threshold})`).join('\n')
  : '• All stock levels healthy'
}`
```

### Bot Reply Templates for Inventory

```
New item added:
"✅ Added *[name]* to your inventory.
 Quantity: [qty] units
 Cost per unit: ₦[cost]
 Reply STOCK to see all your inventory."

Stock updated after sale:
"✅ *[qty] units* of *[name]* sold.
 Remaining: [qty_after] units
 [if low: ⚠️ Running low — you have less than [threshold] left]"

Stock check:
"📦 *Your inventory*

[for each item]:
• [name]: [qty] units ([low emoji if below threshold])

Total items tracked: [count]"

Low stock alert (proactive):
"⚠️ *Low stock: [name]*
You have [qty] units left, below your threshold of [threshold].
Want me to set a restock reminder?"
```

### Guided Client Setup — client-setup-service.ts

```typescript
// client-setup-service.ts
// Manages the conversational guided client creation flow.
// Tracks setup state per phone number so multi-turn conversations
// work correctly across separate webhook calls.

import { supabase } from './supabase'

export type SetupStep =
  'contact_info' | 'project' | 'deposit' | 'invoice' | 'complete'

export async function startGuidedClientSetup(
  orgId: string,
  phoneNumber: string,
  clientName: string
) {
  // Create the client immediately with the name we already have
  const { data: client } = await supabase
    .from('clients')
    .insert({ org_id: orgId, name: clientName, created_via: 'whatsapp' })
    .select().single()

  // Save setup state so next messages from this number are routed here
  await supabase.from('whatsapp_sessions').update({
    setup_state: JSON.stringify({
      flow: 'client_setup',
      step: 'contact_info',
      client_id: client.id,
      client_name: clientName
    })
  }).eq('phone_number', phoneNumber)
}

export async function continueGuidedSetup(
  phoneNumber: string,
  userReply: string,
  setupState: any
): Promise<{ reply: string; nextState: any | null }> {

  switch (setupState.step) {

    case 'contact_info': {
      if (userReply.toUpperCase() !== 'SKIP') {
        // Detect phone vs email and save accordingly
        const isPhone = /^\+?[\d\s]{7,}$/.test(userReply)
        await supabase.from('clients').update(
          isPhone ? { phone: userReply } : { email: userReply }
        ).eq('id', setupState.client_id)
      }
      return {
        reply: `✅ *${setupState.client_name}* added.\n\nIs there a project to set up for them now? Reply with the project name, fee, and deadline, or reply SKIP.`,
        nextState: { ...setupState, step: 'project' }
      }
    }

    case 'project': {
      if (userReply.toUpperCase() === 'SKIP') {
        return {
          reply: `Got it, you can add a project later from your dashboard.\n\nHas ${setupState.client_name} paid anything yet? Reply with the amount or NO.`,
          nextState: { ...setupState, step: 'deposit', project_id: null }
        }
      }
      // Parse "Website design 450000 July 30" style input
      // Create project and auto-set deadline reminders
      // (see createProject in project-service.ts, already specced)
      return {
        reply: `✅ Project created with deadline reminders set.\n\nHas ${setupState.client_name} paid a deposit yet? Reply with the amount or NO.`,
        nextState: { ...setupState, step: 'deposit' }
      }
    }

    case 'deposit': {
      if (userReply.toUpperCase() !== 'NO') {
        const amount = parseFloat(userReply.replace(/[^0-9.]/g, ''))
        if (amount > 0 && setupState.project_id) {
          await supabase.rpc('increment_project_received', {
            p_project_id: setupState.project_id,
            p_amount: amount
          })
        }
      }
      return {
        reply: `Want me to generate an invoice for ${setupState.client_name} now? Reply YES or NO.`,
        nextState: { ...setupState, step: 'invoice' }
      }
    }

    case 'invoice': {
      const wantsInvoice = userReply.toUpperCase() === 'YES'
      // Generate invoice only on explicit YES
      const invoiceNote = wantsInvoice
        ? '\n• Invoice ready to review and send'
        : ''
      // Clear setup state
      await supabase.from('whatsapp_sessions').update({
        setup_state: null
      }).eq('phone_number', phoneNumber)

      return {
        reply: `✅ *${setupState.client_name} is fully set up!*

Here's what was created:
• Client folder: ${setupState.client_name}
${setupState.project_id ? '• Project created with deadline reminders' : ''}
${invoiceNote}

Reply *CLIENTS* to see all your clients.`,
        nextState: null  // flow complete
      }
    }

    default:
      return { reply: '', nextState: null }
  }
}
```

### Build Order for Both Features in the Bot

1. Run inventory SQL (tables + RPC function) in Supabase
2. Build `inventory-service.ts`
3. Add inventory action to `action-executor.ts`
4. Add `GENERATE_INVOICE` and `START_CLIENT_SETUP` actions to
   `action-executor.ts`
5. Update `ai-assistant.ts` SYSTEM_PROMPT with new action tags and
   inventory context injection
6. Build `client-setup-service.ts`
7. Add `setup_state` column to `whatsapp_sessions` table:
   `alter table whatsapp_sessions add column setup_state jsonb;`
8. Update `message-handler.ts` to check `setup_state` before routing
   to normal AI flow, if state is not null, route to
   `continueGuidedSetup()` instead
9. Test: "I have 50 units of Ankara fabric" (inventory add)
10. Test: "I sold 12 units of Ankara" (stock decrement)
11. Test: "New client Marcus, website 450k, due July 30" (guided setup)

---

## Two-Layer Permission System — WhatsApp Bot Implementation

### Updated Identity Resolution in message-handler.ts

The bot now resolves THREE identity types per incoming message, not
just owner/staff. Add this enhanced lookup before any message routing:

```typescript
// Enhanced getOrCreateUser() result now includes role and permissions
export interface BotUser {
  user_id: string
  org_id: string
  phone_number: string
  role: 'owner' | 'admin' | 'staff' | 'family_member' | 'viewer'
  can_see_clients: boolean
  can_see_income: boolean
  can_export: boolean
  whatsapp_active: boolean
  organizations: {
    name: string
    plan: string
    status: string
    currency: string
  }
}

// In message-handler.ts, after user lookup, add these gates:

// Gate 1: Organization suspended
if (user.organizations.status === 'suspended') {
  return buildReply(
    '⚠️ Your account is currently paused.\n' +
    'Contact support@gettrueflow.com for help.'
  )
}

// Gate 2: WhatsApp access revoked by owner
if (!user.whatsapp_active) {
  return buildReply(
    'You don\'t currently have WhatsApp access for this account.\n' +
    'Ask your account owner to enable it in their team settings.'
  )
}

// Gate 3: Viewer role has no write access via bot
if (user.role === 'viewer') {
  return buildReply(
    'Your account has view-only access.\n' +
    'You can check summaries but can\'t submit receipts or\n' +
    'make changes via WhatsApp.'
  )
}

// Pass permissions as context to getAIResponse()
// so the AI knows what THIS specific user can see
const userPermissions = {
  isOwnerOrAdmin: ['owner', 'admin'].includes(user.role),
  canSeeClients: user.can_see_clients || ['owner','admin'].includes(user.role),
  canSeeIncome: user.can_see_income || ['owner','admin'].includes(user.role),
  canExport: user.can_export || ['owner','admin'].includes(user.role),
  isFamilyMember: user.role === 'family_member'
}
```

### Role-Specific Bot Responses

Add these to the SYSTEM_PROMPT in ai-assistant.ts, inside the
SCOPE BOUNDARY section, after the existing out-of-scope redirect rule:

```
ROLE CONTEXT:
The current user's role is provided in the context block below.
Respond based on their actual permissions, never assume Owner-level
access unless the role says 'owner' or 'admin'.

If role is 'staff' and user asks about clients or income:
"You don't have access to client and income data for this account.
 You can scan receipts, check your submitted expenses, and set
 reminders. For financial summaries, the account owner can help."

If role is 'family_member' and user asks about business clients:
"That looks like a business question. I can help you track household
 expenses, set family budgets, and manage your own reminders.
 For business data, message on the business account."

If role is 'viewer' and user tries to submit anything:
"Your account has view-only access. I can share summaries and
 reports but can't accept submissions on your behalf. The account
 owner can change your access level in their team settings."
```

### WhatsApp Invite Message Template

When an owner invites a staff member via phone number from the web
app, send this message immediately via Twilio:

```
👋 Hi! [Owner name] has invited you to join
[Business name] on TrueFlow as [Role].

[If Staff]:
You'll be able to scan receipts and log expenses
for the business by messaging this number.

[If Family Member]:
You'll be able to track your household expenses
and budgets together with [Owner first name].

[If Admin]:
You'll have full access to manage [Business name]'s
finances and team on TrueFlow.

Tap here to accept and set up your account:
[invite link]

Or simply reply START to begin using the WhatsApp
bot right away (you can complete your profile later).
```

When the invited person replies START before clicking the invite link:
- Create their profile linked to the org immediately
- Set role and permissions from the pending org_members row
- Clear the invite_token
- Send the standard first-time welcome message

### Build Order for Bot Permission Updates

1. Update the BotUser interface in user-service.ts to include all
   new org_members fields (role, can_see_clients, can_see_income,
   can_export, whatsapp_active)
2. Update the getOrCreateUser() Supabase query to select these new
   columns from org_members
3. Add the three permission gates to message-handler.ts in the
   exact order shown above (suspended check first, then whatsapp_active,
   then viewer check)
4. Add userPermissions object construction and pass it into
   getAIResponse() as additional context
5. Add the role context block to the SYSTEM_PROMPT in ai-assistant.ts
6. Update the WhatsApp invite message sending function to use the
   new template above
7. Handle the "reply START before accepting invite link" case in
   message-handler.ts by checking for pending org_members rows
   where whatsapp_number matches and invite_token is not null
