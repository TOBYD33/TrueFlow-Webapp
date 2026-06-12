// ai-assistant.ts
// Core conversational AI engine.
// Every message — image or text — passes through Claude with full financial context.
// Claude replies naturally and includes hidden ACTION tags for budget/reminder changes.

import Anthropic from '@anthropic-ai/sdk'
import { getMonthlySpending, getBudgetStatus } from './report-service'
import { getUpcomingReminders } from './reminder-service'
import { getConversationHistory, saveMessage } from './conversation'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

export async function getWelcomeMessage(userName: string): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `New user just joined TrueFlio. Their name/number is: ${userName}. Write a warm welcome message (3-4 lines max). Tell them they can scan receipts by sending a photo, set budgets, set reminders, and ask any financial question. Keep it WhatsApp-friendly with *bold* for key points.`
      }
    ]
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Welcome to TrueFlio! 👋'
}
