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
