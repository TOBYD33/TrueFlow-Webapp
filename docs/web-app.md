# Phase 2 — Web App
> Read CLAUDE.md first — it has the full schema, env vars, and coding rules.
> Build Phase 1 (WhatsApp bot) first. Start this only when the bot is live.
> Uses the same Supabase backend — no new tables needed except what is in CLAUDE.md.

---

## Goal

A full web dashboard at app.gettrueflow.com for business owners and accountants.
Primary users: owners at a desk doing monthly reviews, accountants reviewing books,
enterprise admins managing multiple staff.

Everything the WhatsApp bot and mobile app do is visible here in real time.
Scan on WhatsApp → appears in web dashboard in under 2 seconds.

---

## Folder Structure

```
/web
  /app                            ← Next.js 14 App Router
    layout.tsx                    ← Root layout
    page.tsx                      ← Redirect to /dashboard
    /(protected)                  ← Route group — middleware protects these
      layout.tsx                  ← Sidebar + top nav layout
      /dashboard
        page.tsx                  ← Main dashboard
        loading.tsx
      /receipts
        page.tsx                  ← Receipt list with filters
        /[id]
          page.tsx                ← Receipt detail + edit
      /reports
        page.tsx                  ← Analytics, charts, export
      /invoices
        page.tsx                  ← Invoice list (Pro plan)
        /new
          page.tsx                ← Create invoice
      /team
        page.tsx                  ← Team management
      /settings
        page.tsx                  ← Account, subscription, integrations
    /(auth)
      /login
        page.tsx
      /signup
        page.tsx
    /accountant/[token]
      page.tsx                    ← Read-only portal — no login needed
    /api
      /scan
        route.ts                  ← Upload image → Claude Vision → return data
      /receipts
        route.ts                  ← Save receipt to Supabase
      /export/pdf
        route.ts                  ← Generate PDF report
      /export/excel
        route.ts                  ← Generate Excel file
      /share-link
        route.ts                  ← Generate accountant share link
      /paystack/webhook
        route.ts                  ← Handle Paystack subscription events
  /components
    Sidebar.tsx
    StatCard.tsx
    ReceiptTable.tsx              ← TanStack Table with sorting/filtering
    CategoryChart.tsx             ← Recharts horizontal bar chart
    SpendTrendChart.tsx           ← Recharts line chart — 6-month trend
    BudgetBar.tsx                 ← Progress bar per category
    ReceiptUpload.tsx             ← Drag-and-drop + click to upload
    ChannelBadge.tsx              ← 'via WhatsApp' | 'via App' | 'via Web'
    PlanGate.tsx                  ← Wrapper that hides content for lower plans
  /lib
    supabase-browser.ts           ← Supabase client for client components
    supabase-server.ts            ← Supabase client for server components/actions
    utils.ts
  /types
    index.ts
  middleware.ts                   ← Redirect to /login if not authenticated
```

---

## Every Page — What It Contains

### /dashboard
- 4 stat cards: Total Spent, Receipt Count, Via WhatsApp %, Tax Tracked
- Spending by category — horizontal bar chart (Recharts)
- Monthly spend trend — line chart last 6 months
- Recent receipts table — last 10, with ChannelBadge per row
- Real-time: Supabase Realtime subscription updates the table when WhatsApp scan arrives
- Quick action buttons: Upload Receipt, Export PDF, View Reports

### /receipts
- TanStack Table — sortable, filterable, paginated
- Columns: Date | Vendor | Category | Amount | Uploaded by | Channel | Actions
- Filters: date range picker, category dropdown, staff member select, channel select
- Search bar — searches vendor name
- Bulk select + export selected as PDF or Excel
- Click any row → /receipts/[id] — detail view with image + editable fields
- Drag-and-drop upload zone at top → calls /api/scan → confirmation modal → save

### /reports
- Date range picker (this month / last month / Q1 / Q2 / custom)
- Summary row: Total spent, Receipt count, Avg per receipt, Tax tracked
- Category donut chart (Recharts PieChart)
- Month-over-month bar chart (Recharts BarChart)
- Per-staff breakdown table (Business plan only)
- Tax/VAT summary section
- Export PDF button → /api/export/pdf
- Export Excel button → /api/export/excel

### /invoices (Pro plan — use PlanGate wrapper)
- Invoice list table: client, amount, status badge, date, actions
- Status badges: Draft (gray) | Sent (blue) | Paid (green)
- "New Invoice" button → /invoices/new
- /invoices/new: client name, client email, line items (add/remove rows), tax %, totals auto-calculated
- Send button → generates PDF + sends email to client

### /team
- Member list: avatar, name, role badge, WhatsApp number, status
- Invite button → modal: enter phone or email, select role
- Role options: Admin | Staff | Accountant
- WhatsApp toggle per member — enables/disables their scanning
- Remove member button

### /settings
- Profile section: name, email, phone, avatar upload
- Business section: company name, type, logo upload, currency
- Subscription section: current plan card, upgrade/downgrade button
- Accountant share link: generate button, copy link, set expiry, revoke
- Notifications: weekly summary on/off, budget alerts on/off
- Data export: download all data as CSV
- Danger zone: delete account (with confirmation)

### /accountant/[token]
- Validates token against share_links table — no login required
- If invalid or expired → shows "Link expired" message
- If valid → read-only view of the org's receipts and reports
- Date range filter, category filter
- Export PDF and Excel buttons
- Cannot edit, delete, or modify anything
- Shows expiry date in header: "Access expires June 30, 2025"

---

## Real-time Sync from WhatsApp

Add this to the dashboard page to update when a staff member scans via WhatsApp:

```typescript
// In dashboard page.tsx client component
useEffect(() => {
  const channel = supabase
    .channel(`receipts:${orgId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'receipts',
      filter: `org_id=eq.${orgId}`
    }, (payload) => {
      const receipt = payload.new
      setReceipts(prev => [receipt, ...prev])
      // Toast: "New receipt via WhatsApp — ₦18,000 Transport"
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [orgId])
```

---

## /api/scan Route — Receipt Upload

```typescript
// /api/scan/route.ts
// Accepts image upload, calls Claude Vision, returns extracted data
// Same Claude Vision prompt as the WhatsApp bot

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic()

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('image') as File
  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: file.type as any, data: base64 }
        },
        {
          type: 'text',
          text: `Extract receipt data. Return ONLY valid JSON, no markdown, no backticks:
{
  "vendor_name": "string or null",
  "amount": number,
  "currency": "NGN or USD etc",
  "tax_amount": number or null,
  "date": "YYYY-MM-DD",
  "category": "Food & Drink|Transport|Utilities|Office Supplies|Marketing|Rent|Salaries|Other",
  "confidence": "high|medium|low"
}`
        }
      ]
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const data = JSON.parse(text)
  return NextResponse.json(data)
}
```

---

## Auth Flow

- Supabase Auth (email + password + magic link)
- Same `auth.users` table as WhatsApp bot — one account across all channels
- `middleware.ts` protects all routes under `/(protected)`
- `/accountant/[token]` does NOT require auth — validates via share_links table

---

## Deployment

```bash
cd web
npx vercel
# Follow prompts — connect to Vercel project
# Add custom domain: app.gettrueflow.com in Vercel dashboard
# Set all env vars from CLAUDE.md in Vercel environment settings
```

---

## Build Order

1. `npx create-next-app@latest web --typescript --tailwind --app`
2. `npx shadcn@latest init` — install component library
3. Install: `@supabase/supabase-js @supabase/ssr @anthropic-ai/sdk recharts @tanstack/react-table`
4. `supabase-browser.ts` + `supabase-server.ts` — Supabase clients
5. `middleware.ts` — auth protection
6. Auth pages: `/login` and `/signup`
7. Root layout + sidebar component
8. Dashboard page — stat cards + charts + realtime
9. Receipts page — TanStack table + filters
10. `/api/scan` route — Claude Vision upload
11. Receipt upload drag-and-drop component
12. Reports page — charts + export buttons
13. `/api/export/pdf` + `/api/export/excel` routes
14. Team management page
15. Settings page + accountant share link
16. `/accountant/[token]` read-only portal
17. Invoices page (Pro plan — PlanGate wrapper)
18. `/api/paystack/webhook` — subscription management
19. Deploy to Vercel

---

## First Claude Code Prompt for Phase 2

> "Read CLAUDE.md and docs/web-app.md.
> Create the /web folder and scaffold a Next.js 14 project with TypeScript and Tailwind.
> Install shadcn/ui. Set up supabase-browser.ts, supabase-server.ts, and middleware.ts.
> Then build the auth pages and the root layout with sidebar navigation."

---

## Smart Transfer Recognition — Web App Implementation

### Overview
Payment screenshots forwarded to the WhatsApp bot appear instantly in the web app
via Supabase Realtime. The web app is the PRIMARY place owners review, manage,
and deep-dive into all recognised transfer payments.

### New Pages and Components

#### /income — Payments Received Dashboard
This is the Money In hub. Shows all client_payments records.

Layout:
- Top stat cards:
  - Total received this month
  - Total received this year
  - Total outstanding across all clients
  - Number of transfers this month
- Payments table (TanStack Table):
  - Date · Client · Bank · Amount · Project · Reference · Channel · Actions
  - Channel column shows "Transfer In" badge (teal #00D4AA)
  - Click row → opens payment detail modal
  - Receipt image thumbnail in table row — click to enlarge
- Filter bar: date range · client · bank · payment type

#### /income/[id] — Payment Detail
- Full receipt/screenshot image viewer (large)
- AI-extracted data panel beside image:
  - Sender name (as read from screenshot)
  - Bank name
  - Amount
  - Date and time
  - Reference number
  - Narration
  - AI confidence badge
- Linked client (clickable → /clients/[id])
- Linked project (clickable → /projects/[id])
- "Attach to project" button (if not yet linked)
- "Create invoice" button
- Delete payment record

#### Transfer In Channel Badge Component
```tsx
// components/TransferBadge.tsx
export function TransferBadge() {
  return (
    <span style={{
      background: 'rgba(0,212,170,0.1)',
      color: '#00D4AA',
      fontSize: '11px',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '4px',
      letterSpacing: '0.5px'
    }}>
      Transfer In
    </span>
  )
}
```

#### Payment Proof Image Viewer Component
```tsx
// components/PaymentProofViewer.tsx
// Shows the original bank screenshot + AI extracted data side by side
// Left: The actual screenshot image from Supabase Storage
// Right: Structured data Claude extracted from it
// Bottom: Link to client folder and project

interface PaymentProofViewerProps {
  imageUrl: string
  transfer: {
    sender_name: string
    bank: string
    amount: number
    currency: string
    payment_reference: string
    date: string
    narration: string
    ai_confidence: string
  }
  client: { id: string; name: string }
  project?: { id: string; name: string }
}
```

#### Realtime Updates on /income and /dashboard
```typescript
// When a new client_payment arrives from WhatsApp bot
const channel = supabase
  .channel(`income:${orgId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'client_payments',
    filter: `org_id=eq.${orgId}`
  }, (payload) => {
    const payment = payload.new
    setPayments(prev => [payment, ...prev])
    // Toast: "💰 ₦150,000 received from Marcus Adebayo · GTBank"
    showToast(`💰 ${payment.currency} ${payment.amount.toLocaleString()} received from ${payment.notes}`)
  })
  .subscribe()
```

### Updated /clients/[id] — Client Folder with Payment History

Add new "Payments" tab to client folder:
- All client_payments for this client
- Each row: date · amount · bank · reference · receipt thumbnail · project
- Click receipt thumbnail → PaymentProofViewer modal
- Total received from this client (lifetime)
- Outstanding balance (total_fee of all projects - amount_received)
- "Record payment manually" button (for cash payments or offline transfers)

### /clients/[id] Balance Summary Card
```
┌─────────────────────────────────────┐
│  Marcus Adebayo Ventures            │
│                                     │
│  Total earned:    ₦450,000  ✅      │
│  Received:        ₦300,000          │
│  Outstanding:     ₦150,000  ⚠️      │
│                                     │
│  Active projects: 2                 │
│  Payments logged: 3                 │
└─────────────────────────────────────┘
```

### New API Route — /api/income/manual

For cash payments or offline transfers not captured via WhatsApp:
```typescript
// POST /api/income/manual
// Allows web app users to manually record a client payment
// with optional receipt image upload
{
  client_id: string
  project_id?: string
  amount: number
  currency: string
  payment_type: 'transfer' | 'cash' | 'pos' | 'cheque' | 'other'
  payment_date: string
  payment_reference?: string
  image?: File  // optional manual upload of screenshot
  notes?: string
}
```

### Dashboard Widget — "Recent Transfers In"
Add to /dashboard alongside existing spending widgets:

```
💰 RECENT TRANSFERS IN
─────────────────────────────
Marcus Adebayo     ₦150,000  Transfer In  2h ago
Jennifer Okafor    ₦75,000   Transfer In  Yesterday
Apex Solutions     ₦500,000  Transfer In  2 days ago

Total this month: ₦725,000
[View all income →]
```

### Settings — Smart Transfer Recognition Toggle
Add to /settings/business:
- "Smart Transfer Recognition" toggle (on by default)
- "Confirm before logging" toggle (default: ON — always ask owner before saving)
- "Auto-match clients" toggle (default: ON — suggest client matches)
- "Supported banks" info section showing all 15+ Nigerian banks

### Build Order for Smart Transfer Recognition in Web App

1. Add `/income` page — payments received table + stat cards
2. Add `TransferBadge` component
3. Add `PaymentProofViewer` component
4. Add Realtime subscription on `client_payments` to /dashboard and /income
5. Update `/clients/[id]` — add Payments tab with receipt image thumbnails
6. Add `/api/income/manual` route for manual payment entry
7. Add "Recent Transfers In" widget to dashboard
8. Add Smart Transfer Recognition toggle to /settings/business

---

## Passwordless Login Implementation

### Overview
The web app login does not use the standard Supabase email/password flow as
the primary method. It uses OTP delivered via the same WhatsApp number the
user already onboarded with on the bot. Email/password can exist as a
fallback for users who prefer it, but it is never the default path shown.

### /auth/login/page.tsx

```tsx
// Phone number input only. No email field shown by default.
// On submit, calls /api/auth/send-otp and redirects to /auth/login/verify

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit() {
    setLoading(true)
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone })
    })
    if (res.ok) {
      router.push(`/auth/login/verify?phone=${encodeURIComponent(phone)}`)
    }
    setLoading(false)
  }

  return (
    <div>
      <h1>Log in to TrueFlow</h1>
      <p>Enter the phone number you use with our WhatsApp bot.</p>
      <input
        type="tel"
        placeholder="+234 801 234 5678"
        value={phone}
        onChange={e => setPhone(e.target.value)}
      />
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Sending code...' : 'Send code to WhatsApp'}
      </button>
    </div>
  )
}
```

### /api/auth/send-otp/route.ts

```typescript
// Generates a 6-digit OTP, stores it, sends via WhatsApp bot's
// existing Twilio connection (calls the bot's send endpoint or
// uses Twilio directly with the same credentials).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

export async function POST(req: NextRequest) {
  const { phone } = await req.json()

  // Check a profile exists for this phone number
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No account found for this number. Start on WhatsApp first.' }, { status: 404 })
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString()

  await supabase.from('otp_codes').insert({ phone_number: phone, code })

  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${phone}`,
    body: `Your TrueFlow code: ${code}\n\nThis code expires in 10 minutes.`
  })

  return NextResponse.json({ success: true })
}
```

### /api/auth/verify-otp/route.ts

```typescript
// Validates the OTP, marks it used, creates a Supabase session
// for the matching user via signInWithOtp or a custom session token.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const { phone, code } = await req.json()

  const { data: otp } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('phone_number', phone)
    .eq('code', code)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .single()

  if (!otp) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
  }

  await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .single()

  // Generate a Supabase session for this user
  // (implementation depends on whether using Supabase Auth admin API
  // to create a session token, or a custom JWT signed with service role)

  return NextResponse.json({ success: true, userId: profile!.id })
}
```

### /auth/login/verify/page.tsx

```tsx
// 6-digit code input. On success, redirects to /dashboard.

'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function VerifyPage() {
  const [code, setCode] = useState('')
  const router = useRouter()
  const params = useSearchParams()
  const phone = params.get('phone')

  async function handleVerify() {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code })
    })
    if (res.ok) {
      router.push('/dashboard')
    }
  }

  return (
    <div>
      <h1>Enter your code</h1>
      <p>We sent a 6-digit code to your WhatsApp.</p>
      <input
        type="text"
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="000000"
      />
      <button onClick={handleVerify}>Verify and log in</button>
    </div>
  )
}
```

### Direct Link from WhatsApp Bot

After the first successful receipt scan, the bot sends:
```
👉 app.gettrueflow.com/login?phone=2348012345678
```

This pre-fills the phone field on `/auth/login` so the user only has to tap
"Send code to WhatsApp" rather than typing their number again.

### Build Order for Passwordless Login

1. Add `otp_codes` table (shared with bot, already in CLAUDE.md schema)
2. Build `/api/auth/send-otp/route.ts`
3. Build `/api/auth/verify-otp/route.ts`
4. Build `/auth/login/page.tsx`
5. Build `/auth/login/verify/page.tsx`
6. Update WhatsApp bot's post-first-scan message to include the deep link

---

## TrueFlow Chat — Web-Native AI Assistant

### Why This Exists, and Why It Is Different From the WhatsApp Bot

The WhatsApp bot is deliberately narrow because Meta's WhatsApp Business
API terms ban general-purpose AI chatbots (see CLAUDE.md "Platform
Compliance" section). That restriction is channel-specific, it applies to
WhatsApp because Meta controls that platform, not because TrueFlow's
product philosophy requires narrowness everywhere.

The web app is not bound by WhatsApp's terms. TrueFlow Chat is the place
where the assistant can reason more deeply over a user's own financial
data, the kind of conversation someone has sitting at a desk reviewing
their business, not the 20-second transactional exchange someone has
standing at a market stall. This is a genuine product opportunity created
by the compliance constraint, not a workaround to evade it, TrueFlow Chat
still does not become a general-purpose assistant, it becomes a wider but
still bounded one, scoped to financial reasoning over the user's own
TrueFlow data.

### Where TrueFlow Chat Lives in the App

Add a new entry to the main sidebar navigation, positioned near the top,
above Receipts:
```
Dashboard
TrueFlow Chat   ← new
Receipts
Budgets
Reminders
Clients
Projects
...
```

Route: `/chat`

### What TrueFlow Chat Can Do That the WhatsApp Bot Cannot

| Capability | WhatsApp Bot | TrueFlow Chat |
|---|---|---|
| Scan a receipt, log it | Yes | Yes (upload, not camera) |
| Check current budget status | Yes | Yes |
| Set a reminder | Yes | Yes |
| "Why did my spending spike in March?" | No, redirects | Yes, real trend reasoning |
| "Should I be worried about this client's payment pattern?" | No, redirects | Yes, judgment over their data |
| "Explain what a cash flow statement means" | No, redirects | Yes, financial literacy, grounded in their own numbers |
| Arbitrary off-topic questions (weather, code, etc.) | No, redirects | No, also redirects, see scope below |

TrueFlow Chat is wider than the bot, not unbounded. It still does not
answer general knowledge questions unrelated to the user's finances.

### /api/chat Route

```typescript
// /api/chat/route.ts
// Web-native chat endpoint. Reuses the same underlying context-building
// logic as the WhatsApp bot's getAIResponse(), but with TRUEFLOW_CHAT_PROMPT
// instead of the WhatsApp SYSTEM_PROMPT, and identified by Supabase user_id
// rather than phone number, since not every web user has a phone number on
// file (see Gmail sign-up consideration, CLAUDE.md identity section).

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getMonthlySpending, getBudgetStatus } from '@/lib/report-service'
import { getUpcomingReminders } from '@/lib/reminder-service'
import { getClientsByOrg } from '@/lib/client-service'

const claude = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TRUEFLOW_CHAT_PROMPT = `
You are TrueFlow Chat, the web-based AI assistant for TrueFlow. You help
business owners understand and reason about their own financial data in
more depth than a quick WhatsApp exchange allows.

SCOPE BOUNDARY:
You help with anything related to the user's OWN financial data already
in TrueFlow: explaining spending trends, reasoning about client payment
patterns, summarizing budget health, explaining financial concepts in
plain language using their real numbers as examples, and all the same
core actions the WhatsApp bot supports (logging receipts, setting budgets
and reminders, managing clients and projects).

You do NOT answer general knowledge questions unrelated to their
finances, give specific investment or legal advice, write unrelated code,
or engage in open-ended conversation outside the financial/business scope
of TrueFlow. If asked something out of scope, redirect clearly and
warmly: "That's outside what I help with here, I'm focused on your
TrueFlow data and finances. [one relevant suggestion]."

YOUR PERSONALITY:
- Warm, direct, like a smart financial advisor who already knows their
  business
- You can be more thorough here than on WhatsApp, longer explanations are
  fine when the question genuinely calls for it
- Use the same ACTION tag system as the WhatsApp bot for budgets,
  reminders, client/project actions
- Cite real numbers from their data whenever reasoning about trends or
  patterns, never generic advice disconnected from their actual figures

ACTIONS (same as WhatsApp bot):
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:CREATE_CLIENT:{name}
ACTION:CREATE_PROJECT:{clientName}:{projectName}:{totalFee}:{deadline}
ACTION:LOG_PAYMENT:{clientName}:{amount}:{projectName}
`

export async function POST(req: NextRequest) {
  const { message, userId } = await req.json()

  const { data: orgMember } = await supabase
    .from('org_members')
    .select('org_id, organizations(name, currency, plan)')
    .eq('user_id', userId)
    .single()

  if (!orgMember) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  const orgId = orgMember.org_id

  const [spending, budgets, reminders, clients] = await Promise.all([
    getMonthlySpending(orgId),
    getBudgetStatus(orgId),
    getUpcomingReminders(orgId, 7),
    getClientsByOrg(orgId)
  ])

  const contextBlock = `
[FINANCIAL CONTEXT]
Business: ${orgMember.organizations.name}
Plan: ${orgMember.organizations.plan}

SPENDING THIS MONTH:
${spending.categories.map((c: any) => `• ${c.name}: ${spending.currency} ${c.amount.toLocaleString()}`).join('\n')}

BUDGETS:
${budgets.map((b: any) => `• ${b.category}: ${Math.round((b.spent / b.limit) * 100)}% used`).join('\n')}

UPCOMING REMINDERS:
${reminders.map((r: any) => `• ${r.title} — ${r.due_date}`).join('\n')}

CLIENTS:
${clients.map((c: any) => `• ${c.name}: outstanding ${c.outstanding_balance.toLocaleString()}`).join('\n')}
`

  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1000,
    system: TRUEFLOW_CHAT_PROMPT,
    messages: [
      { role: 'user', content: contextBlock },
      { role: 'assistant', content: 'Context loaded.' },
      { role: 'user', content: message }
    ]
  })

  const fullReply = response.content[0].type === 'text' ? response.content[0].text : ''
  const actions = fullReply.split('\n').filter(l => l.startsWith('ACTION:')).map(l => l.replace('ACTION:', ''))
  const cleanReply = fullReply.split('\n').filter(l => !l.startsWith('ACTION:')).join('\n').trim()

  // Execute actions via the same action-executor logic the bot uses
  // (import and call executeActions(actions, { org_id: orgId }) here)

  return NextResponse.json({ reply: cleanReply })
}
```

### /chat/page.tsx — UI

A simple, familiar chat interface, message bubbles, a text input, no
camera or voice input required for v1 since receipt photo upload already
exists on the Receipts page. Each TrueFlow Chat conversation should be
saved per user (a new `web_chat_conversations` table, mirroring the
WhatsApp bot's `whatsapp_conversations` pattern, keyed by `user_id`
instead of `phone_number`) so context persists across sessions the same
way it does on WhatsApp.

### Bridging Message From WhatsApp

When the WhatsApp bot redirects an out-of-scope request, it should offer
the web app as the next step, turning the compliance boundary into a
useful bridge rather than a dead end:
```
"I can't reason through that here, but you can ask me
in more depth on the full TrueFlow Chat:
👉 app.gettrueflow.com/chat"
```

### Build Order for TrueFlow Chat

1. Add `web_chat_conversations` table to Supabase (mirrors
   `whatsapp_conversations`, keyed by `user_id`)
2. Build `/api/chat/route.ts` with `TRUEFLOW_CHAT_PROMPT`
3. Build `/chat/page.tsx` basic message UI
4. Add `TrueFlow Chat` entry to the sidebar navigation
5. Wire action execution into the same `action-executor.ts` logic the bot
   already uses, do not duplicate this logic
6. Update the WhatsApp bot's out-of-scope redirect message to link to
   `/chat`

---

## Inventory Tracking — Web App Implementation

### /inventory Page

New sidebar entry: **Inventory** (icon: box or package)
Position in sidebar: between Receipts and Budgets
Plan gate: SME Starter and above (use PlanGate wrapper)

```
/inventory
  page.tsx           ← inventory list + summary cards
  /[id]
    page.tsx         ← item detail, movement history, edit
  /new
    page.tsx         ← add new item form
```

### /inventory — Main List Page

Top summary row:
- Total items tracked
- Total stock value (sum of quantity_on_hand × unit_cost across all items)
- Items needing restock (quantity_on_hand <= low_stock_threshold), shown in amber

Table (TanStack Table):
- Columns: Item name | SKU | Category | On Hand | Unit Cost | Unit Price | Value | Status | Actions
- Row color: amber background if below low_stock_threshold, red if at zero
- Quick actions per row: Restock (+qty), Record Sale (-qty), Edit, Archive
- "Add Item" button top right → /inventory/new

### /inventory/[id] — Item Detail

- Item name, SKU, category, unit cost, unit price, low stock threshold
  (all editable inline)
- Current quantity on hand, large and prominent
- Two quick action buttons: "Record Sale" and "Restock"
  both open a simple amount input modal, confirm, then call
  /api/inventory/movement
- Full movement history (TanStack Table): date, type, quantity change,
  quantity after, reference, notes
- "Archive item" button (soft delete, sets status = 'archived')

### /inventory/new — Add Item Form

Fields: Item name (required), SKU (optional), Category (optional),
Opening quantity, Unit cost (what you pay), Unit price (what you sell for),
Low stock threshold (default 5), Description (optional)

On submit: creates inventory_items row AND a 'restock' inventory_movement
row for the opening quantity, so history is complete from day one.

### API Routes

```
POST /api/inventory/items       ← create new item
PATCH /api/inventory/items/[id] ← update item details
POST /api/inventory/movement    ← record a stock movement (restock/sale/adjustment)
GET  /api/inventory/low-stock   ← returns items below threshold (for dashboard widget)
```

### /api/inventory/movement/route.ts

```typescript
// Records a stock movement via the Supabase RPC function.
// Shared by both manual web entries and AI-initiated movements.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { itemId, quantityChange, changeType, notes, referenceType, referenceId } = await req.json()

  const { error } = await supabase.rpc('update_inventory_stock', {
    p_item_id: itemId,
    p_quantity_change: quantityChange,
    p_change_type: changeType,
    p_reference_type: referenceType || null,
    p_reference_id: referenceId || null,
    p_notes: notes || null
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
```

### Dashboard Widget — Inventory Alert

Add a low-stock alert widget to /dashboard, positioned near the budget
alerts widget:

```
📦 INVENTORY ALERTS
─────────────────────────────
⚠️ Ankara Fabric     3 units left
🔴 Blue Lace         0 units left
✅ White Cotton      42 units

[View all inventory →]
```

### Receipt Integration (Buying Stock to Resell)

When a user uploads a receipt for a supplier purchase, the AI (on web
via TrueFlow Chat) or the bot (on WhatsApp) should ask:
"Was this a stock purchase to resell, or a business expense for your own
use?"
- Business expense → creates a receipt row only (existing behavior)
- Stock purchase → creates a receipt row AND a restock inventory_movement
  for the item purchased, linking the receipt as reference_id on the
  movement row so both records point to the same transaction

### /clients/[id] — Link Sales to Inventory

On the "Record Payment" modal inside a client folder, add an optional
"Mark items sold" section: a multi-select list of inventory items with
quantity fields. On confirm, records the client_payment AND decrements
stock for each selected item via the same RPC function. This connects
the two features without either one depending on the other.

### Build Order for Inventory in Web App

1. Confirm inventory tables and RPC function exist in Supabase
   (created by the bot build, shared schema)
2. Build /api/inventory/items and /api/inventory/movement routes
3. Build /inventory/new page
4. Build /inventory list page with TanStack Table
5. Build /inventory/[id] detail page with movement history
6. Add inventory sidebar entry (PlanGate: SME Starter+)
7. Add low-stock widget to /dashboard
8. Add "Mark items sold" to /clients/[id] Record Payment modal
9. Add stock-purchase question to receipt upload flow

---

## Tello — AI Assistant Entry Animation & Welcome Flow

### Overview

Tello is the named persona of TrueFlow Chat. Same /api/chat backend,
same TRUEFLOW_CHAT_PROMPT, same Supabase data access, just with a name,
a pulsating entry animation, and a context-aware welcome message that
fires automatically on every login. Full persona spec is in CLAUDE.md
under "Tello — The TrueFlow AI Assistant Persona." This section covers
the web app implementation only.

### Update to TRUEFLOW_CHAT_PROMPT

Add this as the very first line of TRUEFLOW_CHAT_PROMPT in the
/api/chat/route.ts file already built:

```typescript
const TRUEFLOW_CHAT_PROMPT = `
Your name is Tello. You are TrueFlow's AI assistant for business owners,
freelancers, and families. When introducing yourself for the first time,
say "I'm Tello, your TrueFlow AI assistant." On all subsequent messages
in the same conversation, refer to yourself naturally as "I" without
re-introducing your name.

// ... rest of existing TRUEFLOW_CHAT_PROMPT content unchanged
`
```

### New API Route — /api/tello/welcome

```typescript
// /api/tello/welcome/route.ts
// Called during login redirect, BEFORE the dashboard renders.
// Pre-generates Tello's opening message so it is ready to play
// word-by-word instantly when the animation triggers.
// Stored in session state, not Supabase.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const claude = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, orgId, isFirstTime } = await req.json()

  if (isFirstTime) {
    return NextResponse.json({
      message: `Hi there! I'm Tello, your TrueFlow AI assistant. 👋\n\nI'm here to help you track your money, manage your clients, and stay on top of your finances — all just by chatting with me.\n\nHere's what we can do together:\n\n📷 Scan receipts — upload any receipt photo and I'll read it\n💰 Track client payments — forward payment proof and I'll log it\n📊 Set budgets — tell me how much to allocate per category\n⏰ Set reminders — I'll nudge you before bills and deadlines\n🗂️ Manage clients — create folders, track projects and income\n\nWant to start with something specific, or should I walk you through it step by step?`,
      isFirstTime: true
    })
  }

  // Returning user — pull the most urgent real data points
  const [profile, unreviewedReceipts, outstandingClients,
         upcomingReminders, budgetsAtRisk] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('receipts').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('is_verified', false)
      .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString()),
    supabase.from('clients').select('name, outstanding_balance')
      .eq('org_id', orgId).gt('outstanding_balance', 0)
      .order('outstanding_balance', { ascending: false }).limit(1),
    supabase.from('reminders').select('title, due_date')
      .eq('org_id', orgId).eq('status', 'active')
      .gte('due_date', new Date().toISOString().split('T')[0])
      .lte('due_date', new Date(Date.now() + 3*24*60*60*1000)
        .toISOString().split('T')[0])
      .order('due_date', { ascending: true }).limit(1),
    supabase.from('budgets').select('category, amount, spent:receipts(amount)')
      .eq('org_id', orgId).limit(10)
  ])

  const name = profile.data?.full_name?.split(' ')[0] || 'there'
  const urgentPoints: string[] = []

  if ((unreviewedReceipts.count || 0) >= 3) {
    urgentPoints.push(
      `You have ${unreviewedReceipts.count} unreviewed receipts from this week.`
    )
  }

  if (outstandingClients.data?.[0]) {
    const c = outstandingClients.data[0]
    urgentPoints.push(
      `${c.name} still owes you ₦${Number(c.outstanding_balance).toLocaleString()}.`
    )
  }

  if (upcomingReminders.data?.[0]) {
    const r = upcomingReminders.data[0]
    urgentPoints.push(`Reminder: "${r.title}" is due ${r.due_date}.`)
  }

  const dataLine = urgentPoints.length > 0
    ? '\n\n' + urgentPoints.slice(0, 2).join(' ')
    : '\n\nEverything looks on track this week.'

  const message = `Welcome back, ${name}! 👋${dataLine}\n\nWant me to pull up your full summary, or is there something specific on your mind?`

  return NextResponse.json({ message, isFirstTime: false })
}
```

### New Component — components/TelloBubble.tsx

```tsx
// components/TelloBubble.tsx
// The pulsating chat bubble that houses Tello.
// Pulses twice on login, auto-opens once per session,
// then behaves as a normal chat toggle afterward.

'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface TelloBubbleProps {
  userId: string
  orgId: string
  isFirstTime: boolean
}

export function TelloBubble({ userId, orgId, isFirstTime }: TelloBubbleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPulsing, setIsPulsing] = useState(false)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [hasAutoOpened, setHasAutoOpened] = useState(false)
  const wordIndexRef = useRef(0)

  // Pre-fetch the welcome message immediately on mount
  useEffect(() => {
    fetch('/api/tello/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, orgId, isFirstTime })
    })
      .then(r => r.json())
      .then(data => {
        setWelcomeMessage(data.message)
        // Start pulse animation after message is ready
        setIsPulsing(true)
        setTimeout(() => setIsPulsing(false), 1400) // 2 pulses x 600ms + gap
        // Auto-open after pulse completes, only once per session
        if (!hasAutoOpened && window.innerWidth >= 640) {
          setTimeout(() => {
            setIsOpen(true)
            setHasAutoOpened(true)
          }, 1600)
        }
      })
      .catch(() => {
        setWelcomeMessage("Welcome back! What can I help you with today?")
      })
  }, [])

  // Word-by-word text animation when bubble opens with a new message
  useEffect(() => {
    if (!isOpen || !welcomeMessage) return
    setDisplayedText('')
    wordIndexRef.current = 0
    const words = welcomeMessage.split(' ')

    const interval = setInterval(() => {
      if (wordIndexRef.current < words.length) {
        setDisplayedText(prev =>
          prev + (wordIndexRef.current === 0 ? '' : ' ') + words[wordIndexRef.current]
        )
        wordIndexRef.current++
      } else {
        clearInterval(interval)
      }
    }, 38) // ~38ms per word = natural reading pace

    return () => clearInterval(interval)
  }, [isOpen, welcomeMessage])

  return (
    <>
      <style>{`
        @keyframes tello-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(108,99,255,0.3); }
          50% { transform: scale(1.12); box-shadow: 0 0 0 12px rgba(108,99,255,0); }
        }
        .tello-pulsing {
          animation: tello-pulse 600ms ease-in-out 2;
        }
      `}</style>

      {/* Chat panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '88px', right: '24px',
          width: '360px', maxHeight: '520px',
          background: '#16161C', border: '1px solid rgba(108,99,255,0.3)',
          borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
          zIndex: 1000, overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: '#6C63FF',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '700', color: 'white'
              }}>T</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
                  Tello
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                  TrueFlow AI Assistant
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none', border: 'none', color: 'white',
                fontSize: '20px', cursor: 'pointer', lineHeight: 1,
                opacity: 0.8, padding: '4px'
              }}
            >×</button>
          </div>

          {/* Message area */}
          <div style={{
            flex: 1, padding: '20px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            {/* Tello's opening message */}
            <div style={{
              background: 'rgba(108,99,255,0.1)',
              border: '1px solid rgba(108,99,255,0.2)',
              borderRadius: '12px 12px 12px 2px',
              padding: '12px 16px',
              fontSize: '13px', color: '#F0F0F5', lineHeight: '1.7',
              whiteSpace: 'pre-wrap'
            }}>
              {displayedText}
              {displayedText.length < welcomeMessage.length && (
                <span style={{
                  display: 'inline-block', width: '2px', height: '14px',
                  background: '#6C63FF', marginLeft: '2px',
                  animation: 'tello-pulse 600ms ease-in-out infinite'
                }} />
              )}
            </div>
          </div>

          {/* Input area */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', gap: '8px'
          }}>
            <input
              type="text"
              placeholder="Ask Tello anything..."
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '13px', color: '#F0F0F5', outline: 'none'
              }}
            />
            <button style={{
              background: '#6C63FF', border: 'none', borderRadius: '10px',
              padding: '10px 16px', color: 'white',
              fontSize: '13px', cursor: 'pointer'
            }}>Send</button>
          </div>
        </div>
      )}

      {/* The bubble itself */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={isPulsing ? 'tello-pulsing' : ''}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '56px', height: '56px', borderRadius: '50%',
          background: '#6C63FF', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 1001,
          boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          fontSize: '18px', fontWeight: '700', color: 'white'
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        aria-label="Open Tello AI assistant"
      >
        T
      </button>
    </>
  )
}
```

### Where to Mount TelloBubble

Add TelloBubble to the protected layout, not a specific page, so it
appears on every page inside the app once logged in:

```tsx
// app/(protected)/layout.tsx
import { TelloBubble } from '@/components/TelloBubble'

// Inside the layout JSX, after the main content:
<TelloBubble
  userId={session.user.id}
  orgId={orgMember.org_id}
  isFirstTime={isFirstTimeUser}  // determined by receipt count === 0
/>
```

### Build Order for Tello

1. Update TRUEFLOW_CHAT_PROMPT to add "Your name is Tello" at the start
2. Build /api/tello/welcome/route.ts
3. Build components/TelloBubble.tsx
4. Mount TelloBubble in app/(protected)/layout.tsx
5. Wire the chat input inside TelloBubble to call /api/chat so
   the full conversation flow works after the welcome message
6. Test returning user flow: login with an account that has data,
   confirm the welcome message references real data points
7. Test first time user flow: login with a fresh account,
   confirm the intro script plays correctly
8. Test dismiss behavior: confirm auto-open does not trigger again
   on page navigation within the same session

---

## Two-Layer Permission System — Web App Implementation

### Layer 1 Platform Admin Pages (new /admin sub-pages)

#### /admin/team
Super Admin only. Shows all profiles where admin_role is not null.

```tsx
// Columns: Name, Email, Admin Role, Last Active, Actions
// Actions per row:
//   Change Role dropdown (Support, Finance, Read Only only,
//   never Super in dropdown)
//   Revoke Access button (with confirmation dialog)
// Top right: Invite Admin button
//   Modal: email input + role selector (no Super option)
//   On invite: creates a pending invite record and sends email

// Role badge colours:
// super    → Electric Violet #6C63FF
// support  → Blue #378ADD
// finance  → Green #1D9E75
// readonly → Gray #888780
```

#### /admin/users/[id] — Impersonation Entry Point

Add "Impersonate User" button on the existing user detail page.
Only visible to Super Admin (write) and Support Admin (read-only).

On click, show a confirmation dialog:
```
"You are about to view the workspace of [user name].
 This session will be logged.
 Reason for access (required): [text input]
 [Cancel] [Start read-only session]"
```

On confirm:
1. Insert into impersonation_sessions with is_active = true
2. Insert into admin_audit_log with action = 'impersonation_start'
3. Set a session cookie: impersonation_session_id = [session uuid]
4. Redirect to /dashboard — the user's actual dashboard
5. The ImpersonationBanner component (see below) detects the cookie
   and shows on every page

#### ImpersonationBanner Component

```tsx
// components/ImpersonationBanner.tsx
// Shown on every protected page when an impersonation session
// is active. Cannot be dismissed. Always visible.

export function ImpersonationBanner({ userName, sessionId }: {
  userName: string
  sessionId: string
}) {
  async function endSession() {
    await fetch('/api/admin/impersonation/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    })
    window.location.href = '/admin/users'
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#EF9F27', color: '#0A0A0F',
      padding: '10px 24px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '13px', fontWeight: 500
    }}>
      <span>
        👁 Viewing as <strong>{userName}</strong>
        · Your actions here are logged
        · Read-only mode active
      </span>
      <button
        onClick={endSession}
        style={{
          background: '#0A0A0F', color: 'white',
          border: 'none', borderRadius: '6px',
          padding: '6px 16px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 600
        }}
      >
        Exit impersonation
      </button>
    </div>
  )
}
```

Mount in app/(protected)/layout.tsx, checking for the impersonation
session cookie on every render.

### Layer 2 Organization Team Pages

#### /settings/team

Full team management page for org owners and admins.

```tsx
// Sections:
// 1. Current user card (Owner — cannot be changed)
// 2. Staff/Admin/Family list with permission badges
// 3. Accountant share link section (existing feature, surfaced here)
// 4. Pending invites section
// 5. Slot usage counter: "3 of 5 staff slots used"

// Permission badges per member row:
// WhatsApp: green check or gray X
// Clients: green check or gray X
// Export: green check or gray X

// Edit permissions modal (opens on [Edit permissions] click):
//   Role dropdown: Admin / Staff / Family Member / Viewer
//   Three toggles:
//     WhatsApp access (on/off)
//     Can see clients and income (on/off)
//     Can export reports (on/off)
//   Save button → updates org_members row
```

#### /settings/team/invite Modal

```tsx
// Triggered by [+ Invite] button
// Fields:
//   Phone number OR email (tab switcher)
//   Role selector: Admin / Staff / Family Member / Viewer
//   Three permission toggles (pre-set per role, adjustable)
//   Personal message (optional, included in invite)

// On submit:
//   Check slot limit → show upgrade prompt if exceeded
//   If phone: send WhatsApp invite via bot
//   If email: send invite email with accept link
//   Create org_members row with invite_token and invite_expires_at
//   Show success state: "Invite sent to [contact]"
```

#### /api/team/invite Route

```typescript
// POST /api/team/invite
// Body: { orgId, contactType, contact, role, permissions }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuid } from 'uuid'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLOT_LIMITS: Record<string, number> = {
  free: 0, individual: 0, family: 6,
  sme_starter: 5, sme_pro: 15,
  freelancer: 1, agency: 3, studio: 10, enterprise: 999
}

export async function POST(req: NextRequest) {
  const { orgId, contactType, contact, role, permissions } = await req.json()

  const { data: org } = await supabase
    .from('organizations')
    .select('plan, name')
    .eq('id', orgId)
    .single()

  const { count } = await supabase
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .neq('role', 'owner')
    .is('removed_at', null)

  const limit = SLOT_LIMITS[org!.plan] || 0
  if ((count || 0) >= limit) {
    return NextResponse.json(
      { error: 'slot_limit_reached', upgradeRequired: true },
      { status: 403 }
    )
  }

  const token = uuid()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await supabase.from('org_members').insert({
    org_id: orgId,
    role,
    invited_email: contactType === 'email' ? contact : null,
    whatsapp_number: contactType === 'phone' ? contact : null,
    invite_token: token,
    invite_expires_at: expiresAt.toISOString(),
    can_see_clients: permissions.clients,
    can_see_income: permissions.income,
    can_export: permissions.export,
    whatsapp_active: permissions.whatsapp,
    invited_by: (await supabase.auth.getUser()).data.user?.id
  })

  if (contactType === 'phone') {
    // Send WhatsApp invite via bot's Twilio connection
    await sendWhatsAppInvite(contact, org!.name, role, token)
  } else {
    // Send email invite via Resend
    await sendEmailInvite(contact, org!.name, role, token)
  }

  return NextResponse.json({ success: true })
}
```

#### /invite/accept/[token] Page

Public route (no login required). Validates the invite token and
creates the member's account if they don't have one yet.

```tsx
// 1. Look up org_members row by invite_token
// 2. If expired → show "This invite has expired. Ask [org name]
//    to send a new one."
// 3. If valid → show accept page:
//    "You've been invited to join [org name] on TrueFlow
//     as [role]. Create your account to accept."
//    → Email/phone input → OTP → account created →
//      org_members row updated with user_id, joined_at set,
//      invite_token cleared
// 4. Redirect to /dashboard after acceptance
```

#### /api/admin/impersonation/end Route

```typescript
// POST /api/admin/impersonation/end
// Ends an active impersonation session, updates both tables,
// clears the session cookie

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json()

  await supabase
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString(), is_active: false })
    .eq('id', sessionId)

  await supabase.from('admin_audit_log').insert({
    admin_id: currentAdminId,
    action: 'impersonation_end',
    target_id: sessionId,
    details: { ended_at: new Date().toISOString() }
  })

  const response = NextResponse.redirect('/admin/users')
  response.cookies.delete('impersonation_session_id')
  return response
}
```

### Build Order for Two-Layer Permission System

Layer 1 Platform Admin (build first):
1. Add admin_role column to profiles table
2. Create impersonation_sessions table
3. Migrate existing is_super_admin = true rows to
   admin_role = 'super'
4. Build /admin/team page
5. Build ImpersonationBanner component
6. Build /api/admin/impersonation/end route
7. Add Impersonate button to /admin/users/[id]
8. Mount ImpersonationBanner in protected layout

Layer 2 Organization Roles (build second):
9. Run org_members schema migration (new columns + defaults)
10. Create has_org_permission() Supabase function
11. Build /settings/team page with all sections
12. Build /settings/team/invite modal
13. Build /api/team/invite route with slot limit check
14. Build /invite/accept/[token] public page
15. Update message-handler.ts to check whatsapp_active toggle
    and role-based command gating
16. Update RLS policies to use has_org_permission() function
    for clients, income, and export tables
