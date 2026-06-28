// api/chat/message/route.ts
// Processes TrueFlow Chat text messages through Claude AI.
// Executes actions (SET_BUDGET, SET_REMINDER) directly against Supabase.
// Saves conversation to whatsapp_conversations using phone_number='web:{userId}'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are TrueFlow, a smart AI financial assistant built into the TrueFlow web app.
You help small business owners track expenses, manage budgets, set reminders, and track client income.

WHAT YOU CAN DO:
• Log expenses — user types "I spent ₦5,000 on transport today"
• Set budgets — "Set a food budget of ₦100,000 per month"
• Set reminders — "Remind me to pay salaries on the 25th every month"
• Answer financial questions — "How much did I spend on transport this month?"
• Summarise spending patterns and give smart advice

ACTIONS — append at the very end of your reply when the user requests one.
The user never sees ACTION tags — they are stripped automatically.

Available actions:
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:SHOW_BUDGETS
ACTION:EXPORT_PDF

recurrence values: once | daily | weekly | monthly | yearly
Valid categories: Food & Drink | Transport | Utilities | Office Supplies | Marketing | Rent | Salaries | Other

STYLE:
- Warm and direct — like a smart accountant friend
- Concise but complete — web users read more carefully than WhatsApp
- Use **bold** for amounts and key numbers
- Use • for bullet lists
- Nigerian Naira (₦) by default, format as ₦50,000 not ₦50000
- Dates: "28 June 2026" format
- Never say "I cannot" — always find a way to help`

// ── Action executor ───────────────────────────────────────────────────────────

async function executeActions(
  actions: string[],
  orgId: string,
  admin: ReturnType<typeof getAdmin>
): Promise<string[]> {
  const notes: string[] = []

  for (const action of actions) {
    const parts = action.split(':')
    const type = parts[0]

    if (type === 'SET_BUDGET' && parts.length >= 3) {
      const category = parts[1]
      const amount = parseFloat(parts[2])
      if (!isNaN(amount)) {
        const now = new Date()
        const { error } = await admin.from('budgets').upsert({
          org_id: orgId,
          category,
          amount,
          period: 'monthly',
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        }, { onConflict: 'org_id,category,month,year' })
        if (!error) notes.push(`✅ Budget set: **${category}** — ₦${amount.toLocaleString()}/month`)
      }
    }

    if (type === 'SET_REMINDER' && parts.length >= 4) {
      const title = parts[1]
      const dueDate = parts[2]
      const recurrence = parts[3] ?? 'once'
      const { error } = await admin.from('reminders').insert({
        org_id: orgId,
        title,
        due_date: dueDate,
        recurrence,
        category: 'custom',
        status: 'active',
      })
      if (!error) notes.push(`✅ Reminder set: **${title}** on ${dueDate} (${recurrence})`)
    }
  }

  return notes
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json() as { message: string }
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const admin = getAdmin()
    const chatId = `web:${user.id}`

    // Load org context
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    const orgId = member?.org_id ?? null

    // Load financial context in parallel
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const [receiptsRes, budgetsRes, remindersRes, historyRes] = await Promise.all([
      orgId ? admin.from('receipts').select('amount, category, vendor_name, date').eq('org_id', orgId).gte('date', monthStart) : Promise.resolve({ data: [] }),
      orgId ? admin.from('budgets').select('category, amount').eq('org_id', orgId).eq('month', now.getMonth() + 1).eq('year', now.getFullYear()) : Promise.resolve({ data: [] }),
      orgId ? admin.from('reminders').select('title, due_date, category').eq('org_id', orgId).eq('status', 'active').gte('due_date', monthStart).order('due_date').limit(5) : Promise.resolve({ data: [] }),
      admin.from('whatsapp_conversations').select('role, content').eq('phone_number', chatId).order('created_at', { ascending: false }).limit(20),
    ])

    const receipts = receiptsRes.data ?? []
    const budgets = budgetsRes.data ?? []
    const reminders = remindersRes.data ?? []
    const history = (historyRes.data ?? []).reverse()

    const totalSpent = receipts.reduce((s: number, r: any) => s + Number(r.amount), 0)
    const categoryBreakdown = receipts.reduce<Record<string, number>>((acc, r: any) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {})

    const contextBlock = `
[FINANCIAL CONTEXT — ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}]
Total spent this month: ₦${totalSpent.toLocaleString()} (${receipts.length} receipts)

SPENDING BY CATEGORY:
${Object.entries(categoryBreakdown).map(([cat, amt]) => `• ${cat}: ₦${amt.toLocaleString()}`).join('\n') || '• No spending recorded yet'}

BUDGETS:
${budgets.length > 0
  ? (budgets as any[]).map(b => {
    const spent = categoryBreakdown[b.category] ?? 0
    const pct = Math.round((spent / b.amount) * 100)
    const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '✅'
    return `• ${b.category}: ₦${spent.toLocaleString()} / ₦${Number(b.amount).toLocaleString()} (${pct}%) ${icon}`
  }).join('\n')
  : '• No budgets set'}

UPCOMING REMINDERS:
${reminders.length > 0
  ? (reminders as any[]).map(r => `• ${r.title} — ${r.due_date}`).join('\n')
  : '• No upcoming reminders'}
[END CONTEXT]`

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: contextBlock },
      { role: 'assistant', content: 'Financial context loaded. Ready to help.' },
      ...history.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ]

    // Call Claude
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages,
    })

    const fullReply = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse and strip ACTION tags
    const lines = fullReply.split('\n')
    const actionLines = lines.filter(l => l.trim().startsWith('ACTION:'))
    const actions = actionLines.map(l => l.trim().replace(/^ACTION:/, ''))
    const cleanReply = lines.filter(l => !l.trim().startsWith('ACTION:')).join('\n').trim()

    // Execute actions
    let actionNotes: string[] = []
    if (orgId && actions.length > 0) {
      actionNotes = await executeActions(actions, orgId, admin)
    }

    const finalReply = actionNotes.length > 0
      ? `${cleanReply}\n\n${actionNotes.join('\n')}`
      : cleanReply

    // Save both messages to DB
    await admin.from('whatsapp_conversations').insert([
      { phone_number: chatId, role: 'user', content: message },
      { phone_number: chatId, role: 'assistant', content: finalReply },
    ])

    return NextResponse.json({ success: true, reply: finalReply })
  } catch (err) {
    console.error('chat/message: error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
