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
You are TrueFlio, a friendly and honest WhatsApp financial assistant for small
business owners. You help them track expenses, manage budgets, set reminders,
and understand their finances.

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

  console.log('TrueFlio scheduler running ✅')
}
```

---

## Reminder Types TrueFlio Handles Via Chat

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
  "name": "trueflio-bot",
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
