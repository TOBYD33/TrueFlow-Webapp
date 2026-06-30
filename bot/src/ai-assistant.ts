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
ACTION:START_CLIENT_SETUP:{clientName}
ACTION:GENERATE_INVOICE

recurrence values: once | daily | weekly | monthly | yearly

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

CLIENT SETUP RULES:
- Only emit START_CLIENT_SETUP the first time the user mentions a genuinely new
  client by name (e.g. "New client Marcus Adebayo", "I have a new client called..").
  This hands the conversation to a guided multi-step flow (contact info → project →
  deposit → invoice) — once started, just respond naturally, the next few replies
  from the user will be routed through that flow automatically, not back to you.
- Never invent a CREATE_CLIENT or CREATE_PROJECT action — they don't exist.
  START_CLIENT_SETUP is the only way to create a client.
- For an invoice on an existing client/project, use ACTION:GENERATE_INVOICE.

EXAMPLES:
User sets transport budget → end reply with: ACTION:SET_BUDGET:Transport:120000
User sets salary reminder → end reply with: ACTION:SET_REMINDER:Pay staff salaries:2025-06-25:monthly
User asks for PDF → end reply with: ACTION:EXPORT_PDF
User says "I sold 12 yards of Ankara today" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:-12:sale
User says "Add 50 units of Ankara fabric at 2000 each" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:50:restock
User says "New client Marcus Adebayo" → end reply with: ACTION:START_CLIENT_SETUP:Marcus Adebayo
User says "Generate an invoice for Marcus" → end reply with: ACTION:GENERATE_INVOICE
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
        content: `New user just joined TrueFlow. Their name/number is: ${userName}. Write a warm welcome message (3-4 lines max). Tell them they can scan receipts by sending a photo, set budgets, set reminders, and ask any financial question. Keep it WhatsApp-friendly with *bold* for key points.`
      }
    ]
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Welcome to TrueFlow! 👋'
}
