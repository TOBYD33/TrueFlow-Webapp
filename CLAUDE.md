# TrueFlow — Master Project Brief
> This file is read automatically by Claude Code on every session.
> Do not delete it. Keep it updated as the project evolves.
> Last updated: June 2025

---

## What Is TrueFlow

TrueFlow is an AI-powered conversational financial assistant AND client project manager
for small business owners, freelancers, and agencies.

It serves two directions of money simultaneously:
- MONEY OUT → track your own expenses, budgets, reminders, and financial planning
- MONEY IN  → track client payments, manage project folders, and delivery deadlines

TrueFlow combines: receipt scanning, expense tracking, budget management, reminders,
financial planning, client CRM, invoice generation, and project delivery tracking —
all in one product delivered across three channels sharing one Supabase backend.

Company legal name: **True Financial Portfolio Ltd**
Brand name: **TrueFlow**
Pronounced: **True-Flow** (like the two words "True Flow" said together)
Tagline: *"Your true financial flow."*
Domain: gettrueflow.com
App URL: app.gettrueflow.com
Email: hello@gettrueflow.com

---

## Current Build Status

| Phase | What | Status |
|-------|------|--------|
| Phase 1 | WhatsApp Bot (Conversational AI) | ✅ LIVE |
| Phase 2 | Web App (Expense Tracking + Client CRM) | 🔨 BUILD NOW |
| Phase 3 | Mobile App (React Native + Expo) | ⏳ AFTER PHASE 2 |

Phase 1 is live and running. Build Phase 2 next. Phase 3 last.
Phase 2 and the old Phase 3 (Client CRM) are now ONE unified web app.

---

## The Product Trinity — Three Channels, One Backend

```
WhatsApp Bot (✅ LIVE)
→ Conversational AI assistant
→ Scan receipts by photo, chat about finances
→ Set budgets and reminders via natural language
→ Forward client payment receipts to create client folders
→ Weekly summaries, monthly PDF reports, budget alerts

Web App (🔨 BUILD NOW — app.gettrueflow.com)
→ Full dashboard for MONEY OUT (expenses) + MONEY IN (clients)
→ View all WhatsApp bot data displayed visually
→ Receipt photos + AI transcripts from bot shown side by side
→ Client CRM — folders, projects, income, invoices
→ Subscription payments via Paystack
→ Accountant read-only portal
→ Team management, profile, business settings

Mobile App (⏳ PHASE 3 — after web app)
→ React Native + Expo
→ Camera scanner, push notifications
→ Same dashboard as web, optimised for mobile
→ iOS + Android
```

All three channels share one Supabase database, one auth system, one subscription.
Scan on WhatsApp → appears in web app in under 2 seconds via Supabase Realtime.

---

## Tech Stack

### Shared Backend (all three channels)
- **Database + Auth + Storage + Realtime**: Supabase (PostgreSQL)
- **AI — Receipt Scanning**: Anthropic Claude Vision API
- **AI — Conversations**: Anthropic Claude Messages API
- **Model for chat**: claude-haiku-4-5-20251001 (fast, cheap)
- **Model for receipt scanning**: claude-opus-4-6 (accurate vision)
- **Payments**: Paystack (Nigeria) · Stripe (international — future)
- **PDF Generation**: html-pdf or Puppeteer via Supabase Edge Function

### Phase 1 — WhatsApp Bot (✅ LIVE)
- Node.js + TypeScript + Express.js
- Twilio WhatsApp Business API
- Hosted on Railway.app
- Scheduled jobs: node-cron

### Phase 2 — Web App (🔨 BUILD NOW)
- Framework: Next.js 14 App Router + TypeScript
- Styling: Tailwind CSS + shadcn/ui components
- Charts: Recharts
- Tables: TanStack Table
- File upload: react-dropzone
- PDF export: @react-pdf/renderer or html-pdf
- Excel export: xlsx (SheetJS)
- Hosting: Vercel
- URL: app.gettrueflow.com

### Phase 3 — Mobile App (⏳ LATER)
- React Native + Expo + TypeScript
- Expo Router (file-based navigation)
- Victory Native (charts)
- Expo Camera + ImagePicker
- Expo Notifications (push)
- expo-secure-store (auth persistence)

---

## Environment Variables

### Web App (.env.local in /web folder)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Paystack
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=
PAYSTACK_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://app.gettrueflow.com
NEXT_PUBLIC_SITE_URL=https://gettrueflow.com
```

### WhatsApp Bot (.env in /bot folder)
```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=
WEBAPP_URL=https://app.gettrueflow.com
PRICING_PAGE_URL=https://gettrueflow.com/pricing
```

---

## Complete Database Schema

Run this entire block in Supabase SQL Editor to create all tables.

```sql
-- ── PROFILES ──────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  avatar_url text,
  expo_push_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at on any change
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ── ORGANIZATIONS ─────────────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'sme',
  -- type: 'sme' | 'family' | 'individual' | 'freelancer' | 'agency'
  owner_id uuid references profiles(id),
  plan text default 'free',
  -- plan: 'free' | 'individual' | 'family' | 'sme_starter' | 'sme_pro'
  --       'freelancer' | 'agency' | 'studio' | 'enterprise'
  receipt_limit int default 10,
  client_limit int default 0,
  -- client_limit: 0=none, 10=freelancer, 50=agency, -1=unlimited
  currency text default 'NGN',
  logo_url text,
  paystack_customer_id text,
  paystack_subscription_id text,
  paystack_subscription_status text default 'inactive',
  -- status: 'inactive' | 'active' | 'cancelled' | 'non-renewing'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger organizations_updated_at
  before update on organizations
  for each row execute function update_updated_at();

-- ── ORG MEMBERS ───────────────────────────────────────────────────────
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'staff',
  -- role: 'owner' | 'admin' | 'staff' | 'accountant'
  whatsapp_number text,
  whatsapp_active boolean default true,
  invited_by uuid references profiles(id),
  invited_at timestamptz default now(),
  joined_at timestamptz,
  unique(org_id, user_id)
);

-- ── RECEIPTS (MONEY OUT — your own expenses) ──────────────────────────
create table receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  uploaded_via text default 'web',
  -- uploaded_via: 'whatsapp' | 'web' | 'mobile'
  vendor_name text,
  amount numeric(12,2),
  currency text default 'NGN',
  tax_amount numeric(12,2),
  date date default current_date,
  category text default 'Other',
  -- categories: 'Food & Drink' | 'Transport' | 'Utilities'
  --             'Office Supplies' | 'Marketing' | 'Rent' | 'Salaries' | 'Other'
  notes text,
  image_url text,           -- Supabase Storage URL of receipt photo
  ai_transcript text,       -- full raw text Claude read from the receipt
  ai_confidence text,       -- 'high' | 'medium' | 'low'
  is_verified boolean default false,
  client_id uuid references clients(id) on delete set null,
  -- optional: link this expense to a client project
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz default now()
);

create index on receipts (org_id, date desc);
create index on receipts (org_id, category);

-- ── BUDGETS ───────────────────────────────────────────────────────────
create table budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null,
  period text default 'monthly',
  month int,
  year int,
  created_at timestamptz default now(),
  unique(org_id, category, month, year)
);

-- ── REMINDERS ─────────────────────────────────────────────────────────
create table reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  due_date date not null,
  recurrence text default 'once',
  -- recurrence: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  category text default 'custom',
  -- category: 'tax' | 'salary' | 'supplier' | 'bill'
  --           'compliance' | 'project_deadline' | 'custom'
  status text default 'active',
  -- status: 'active' | 'fired' | 'dismissed'
  fired_at timestamptz,
  created_at timestamptz default now()
);

create index on reminders (org_id, due_date, status);

-- ── WHATSAPP CONVERSATIONS ────────────────────────────────────────────
create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  role text not null,     -- 'user' | 'assistant'
  content text not null,
  created_at timestamptz default now()
);

create index on whatsapp_conversations (phone_number, created_at desc);

-- ── WHATSAPP SESSIONS ─────────────────────────────────────────────────
create table whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  org_id uuid references organizations(id),
  user_id uuid references profiles(id),
  is_new boolean default true,
  last_active_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ── BILLS ─────────────────────────────────────────────────────────────
create table bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  due_date date,
  recurrence text default 'once',
  status text default 'upcoming',
  -- status: 'upcoming' | 'paid' | 'overdue'
  created_at timestamptz default now()
);

-- ── CLIENTS (MONEY IN — people who pay YOU) ───────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  total_earned numeric(12,2) default 0,
  outstanding_balance numeric(12,2) default 0,
  status text default 'active',
  -- status: 'active' | 'inactive' | 'archived'
  created_via text default 'web',
  -- created_via: 'web' | 'whatsapp' | 'mobile'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on clients (org_id, status);

create trigger clients_updated_at
  before update on clients
  for each row execute function update_updated_at();

-- ── PROJECTS ──────────────────────────────────────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  description text,
  total_fee numeric(12,2),
  amount_received numeric(12,2) default 0,
  balance_due numeric(12,2) generated always as (total_fee - amount_received) stored,
  currency text default 'NGN',
  start_date date default current_date,
  deadline date,
  status text default 'in_progress',
  -- status: 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'on_hold'
  delivered_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on projects (org_id, status);
create index on projects (client_id);

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- ── CLIENT PAYMENTS (MONEY IN — individual payments from clients) ─────
create table client_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  amount numeric(12,2) not null,
  currency text default 'NGN',
  payment_type text default 'part_payment',
  -- type: 'deposit' | 'part_payment' | 'full_payment' | 'retainer'
  payment_date date default current_date,
  payment_reference text,
  receipt_image_url text,   -- the photo the client forwarded
  ai_transcript text,       -- what Claude read from the receipt
  notes text,
  created_at timestamptz default now()
);

create index on client_payments (org_id, client_id);

-- ── INVOICES ──────────────────────────────────────────────────────────
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  invoice_number text,      -- e.g. INV-2025-001
  client_name text,
  client_email text,
  line_items jsonb,
  -- [{description, quantity, unit_price, total}]
  subtotal numeric(12,2),
  tax_rate numeric(5,2) default 0,
  tax_amount numeric(12,2),
  total_amount numeric(12,2),
  currency text default 'NGN',
  status text default 'draft',
  -- status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date date default current_date,
  due_date date,
  paid_at timestamptz,
  pdf_url text,             -- Supabase Storage URL of generated PDF
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();

-- ── ACCOUNTANT SHARE LINKS ────────────────────────────────────────────
create table share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  token text unique default gen_random_uuid()::text,
  permission text default 'read',
  -- permission: 'read' | 'export'
  expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz default now()
);

-- ── SUBSCRIPTION EVENTS (Paystack webhook log) ────────────────────────
create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  event_type text,
  payload jsonb,
  processed boolean default false,
  created_at timestamptz default now()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table receipts enable row level security;
alter table budgets enable row level security;
alter table reminders enable row level security;
alter table bills enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table client_payments enable row level security;
alter table invoices enable row level security;
alter table share_links enable row level security;

-- Profiles
create policy "Users see own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);

-- Organizations
create policy "Org members see their org"
  on organizations for select using (
    id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org owners update their org"
  on organizations for update using (owner_id = auth.uid());

-- Receipts
create policy "Org members see receipts"
  on receipts for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org members insert receipts"
  on receipts for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org members update their own receipts"
  on receipts for update using (uploaded_by = auth.uid());
create policy "Org admins delete receipts"
  on receipts for delete using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Clients
create policy "Org members see clients"
  on clients for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage clients"
  on clients for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Projects
create policy "Org members see projects"
  on projects for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage projects"
  on projects for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Client payments
create policy "Org members see client payments"
  on client_payments for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage client payments"
  on client_payments for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Invoices
create policy "Org members see invoices"
  on invoices for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage invoices"
  on invoices for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

---

## Pricing Plans

### Subscription Tiers
| Plan | NGN/month | USD/month | Receipts | Clients | Staff |
|------|-----------|-----------|----------|---------|-------|
| Free | ₦0 | $0 | 10 | 0 | 1 |
| Individual | ₦2,500 | $4.99 | Unlimited | 0 | 1 |
| Family | ₦5,000 | $9.99 | Unlimited | 0 | 6 |
| SME Starter | ₦7,500 | $19 | Unlimited | 10 | 5 |
| SME Pro | ₦15,000 | $39 | Unlimited | 50 | 15 |
| Freelancer | ₦5,000 | $9.99 | Unlimited | 10 | 1 |
| Agency | ₦12,000 | $24.99 | Unlimited | 50 | 3 |
| Studio | ₦25,000 | $49.99 | Unlimited | Unlimited | 10 |
| Enterprise | Custom | Custom | Unlimited | Unlimited | Unlimited |

### Plan Feature Gates
- Client CRM (clients, projects, income): SME Starter+ or Freelancer+
- Invoice generation: SME Pro+ or Agency+
- Accountant share link: SME Starter+
- Team management: Family+ (for family), SME Starter+ (for business)
- Advanced analytics: SME Pro+
- White-label invoices: Studio+

---

## Phase 2 Web App — Complete Specification

### Overview
app.gettrueflow.com is ONE unified web app combining:
- Expense Tracking (MONEY OUT) — data flows in from WhatsApp bot in real time
- Client CRM (MONEY IN) — client folders, projects, income, invoices

### Folder Structure
```
/web
  /app
    layout.tsx                    ← Root layout
    page.tsx                      ← Redirect → /dashboard
    /(auth)                       ← Public routes — no login needed
      /login/page.tsx
      /signup/page.tsx
      /reset-password/page.tsx
      /callback/page.tsx          ← Supabase magic link handler
    /(protected)                  ← Requires login — middleware guards
      layout.tsx                  ← Sidebar + topnav
      /dashboard/page.tsx
      /receipts/page.tsx
      /receipts/[id]/page.tsx
      /reports/page.tsx
      /budgets/page.tsx
      /reminders/page.tsx
      /clients/page.tsx
      /clients/[id]/page.tsx
      /projects/page.tsx
      /projects/[id]/page.tsx
      /income/page.tsx
      /invoices/page.tsx
      /invoices/new/page.tsx
      /invoices/[id]/page.tsx
      /team/page.tsx
      /settings/profile/page.tsx
      /settings/business/page.tsx
      /settings/subscription/page.tsx
      /settings/accountant/page.tsx
      /settings/notifications/page.tsx
    /accountant/[token]/page.tsx  ← Read-only portal — no login needed
    /pricing/page.tsx             ← Public pricing page
    /api
      /scan/route.ts              ← Upload image → Claude Vision → return JSON
      /receipts/route.ts          ← Save receipt
      /export/pdf/route.ts        ← Generate PDF report
      /export/excel/route.ts      ← Generate Excel
      /invoices/pdf/route.ts      ← Generate invoice PDF
      /share-link/route.ts        ← Generate accountant token
      /paystack/webhook/route.ts  ← Handle Paystack events
      /paystack/initialize/route.ts ← Start Paystack checkout
  /components
    /ui                           ← shadcn/ui components
    Sidebar.tsx
    TopNav.tsx
    StatCard.tsx
    ReceiptTable.tsx
    ReceiptImageViewer.tsx        ← Shows photo + AI transcript side by side
    CategoryChart.tsx
    SpendTrendChart.tsx
    BudgetProgressBar.tsx
    ChannelBadge.tsx              ← 'via WhatsApp' | 'via Web' | 'via App'
    ClientCard.tsx
    ProjectCard.tsx
    ProjectStatusBadge.tsx
    InvoiceStatusBadge.tsx
    PlanGate.tsx                  ← Hides content for lower plan users
    UpgradePrompt.tsx             ← CTA shown when feature is plan-gated
    FileDropzone.tsx              ← Drag-and-drop receipt upload
    EmptyState.tsx
  /lib
    supabase-browser.ts
    supabase-server.ts
    paystack.ts
    utils.ts
    plan-limits.ts                ← Helper: canUseCRM(plan), canInviteStaff(plan) etc
  /types
    index.ts
  middleware.ts
```

### Page-by-Page Specification

#### /dashboard
- Welcome: "Good morning, {name}" + today's date
- 4 stat cards: Total Spent this month, Receipts scanned, Outstanding client balance, Tax tracked
- Spending by category — horizontal bar chart (Recharts)
- Income vs Expense chart — last 6 months (Recharts BarChart)
- Recent receipts feed — last 5 with ChannelBadge
- Active projects widget — shows projects with approaching deadlines
- Upcoming reminders — next 3 due
- Supabase Realtime subscription — new receipts from WhatsApp appear instantly

#### /receipts
- TanStack Table — sortable, filterable, paginated (20 per page)
- Columns: Date · Vendor · Category · Amount · Uploaded by · Channel · Actions
- Filters: date range · category · channel (WhatsApp/Web/App) · staff member
- Search: vendor name
- Bulk select → export selected as PDF or Excel
- FileDropzone at top → drag receipt image → calls /api/scan → confirmation modal → save
- Click row → /receipts/[id]

#### /receipts/[id]
- ReceiptImageViewer: receipt photo on left, AI transcript on right
- All fields editable inline: vendor, amount, date, category, tax, notes
- "Attach to client" button → select client + project from dropdown
- Channel badge showing where it came from
- Delete button (with confirmation)
- Created by + timestamp

#### /reports
- Date range picker: This Month / Last Month / Last 3 Months / Last 6 Months / Custom
- Summary row: Total · Count · Average · Tax
- Category donut chart (Recharts PieChart)
- Month-over-month comparison (Recharts BarChart)
- Per-staff breakdown table (plan gate: SME Starter+)
- VAT/Tax summary table
- Export PDF button → /api/export/pdf
- Export Excel button → /api/export/excel

#### /budgets
- Budget list with BudgetProgressBar per category
- Colours: green < 70% · amber 70–89% · red 90%+
- Add Budget button → modal: pick category, enter amount, select period
- Edit amount inline
- Delete budget (with confirmation)
- "Set via WhatsApp" tip shown for mobile users

#### /reminders
- List all reminders sorted by due date
- Overdue reminders shown at top in red
- Each row: title · due date · category tag · recurrence badge · status
- Add Reminder → form: title, date picker, recurrence, category, optional client/project link
- Edit / Dismiss / Delete per row

#### /clients
- Client card grid (or list toggle)
- Each card: name · outstanding balance · active projects count · last activity
- Search by name
- Filter by status (active / inactive / archived)
- "New Client" button → modal: name, phone, email, notes
- Click card → /clients/[id]

#### /clients/[id] — Client Folder
- Client header: name · phone · email · total earned · outstanding balance
- Edit client details inline
- Tabs:
  - Projects — all projects with status, fee, received, balance, deadline
  - Payments — all client_payments with receipt images
  - Invoices — all invoices for this client
  - Notes — free text notes about the client
- "New Project" button → modal
- "Record Payment" button → modal: amount, type, date, attach receipt image
- "Generate Invoice" button → pre-fills from project data

#### /projects
- Table of all projects across all clients
- Columns: Client · Project · Total Fee · Received · Balance · Deadline · Status · Actions
- Filter by status, client, deadline range
- Sort by deadline (soonest first default)
- Click row → /projects/[id]
- "New Project" button

#### /projects/[id]
- Project detail: name · description · client · dates · status
- Financial summary: total fee · received · balance due · progress bar
- Payment history table
- Attached receipts (expenses linked to this project)
- Reminders for this project (auto-created: 7d · 3d · day-of · overdue · unpaid)
- Update status: In Progress → Delivered → Completed
- Edit all fields

#### /income
- All client_payments across all clients
- Total income this month stat card
- Total outstanding balance stat card
- Table: Client · Project · Amount · Type · Date · Receipt
- Click receipt thumbnail → full image viewer
- Filter by client, date, payment type

#### /invoices
- Invoice list table
- Columns: Number · Client · Amount · Status · Due Date · Actions
- Status badges: Draft (gray) · Sent (blue) · Paid (green) · Overdue (red)
- "New Invoice" button → /invoices/new
- Bulk actions: send, export PDF

#### /invoices/new
- Select client (dropdown)
- Select project (auto-fills amounts)
- Add line items (add/remove rows): description · quantity · unit price · total
- Tax rate field (auto-calculates)
- Totals auto-update
- Notes / payment terms field
- Preview button → shows PDF preview
- Save as Draft / Send Now buttons

#### /invoices/[id]
- Invoice preview (PDF-like layout)
- Edit button (if draft)
- Mark as Paid button
- Send via Email button
- Download PDF button
- Share link (payment link for client)

#### /team
- Member list: avatar · name · role badge · WhatsApp number · status
- Invite button → modal: enter email or phone · select role
- Roles: Owner · Admin · Staff · Accountant
- WhatsApp toggle per staff member
- Remove member (with confirmation)
- Pending invites section

#### /settings/profile
- Full name field (editable)
- Phone number field
- Email (shown, not editable — use Supabase Auth to change)
- Avatar upload → uploads to Supabase Storage
- Change password → sends Supabase password reset email
- Save button

#### /settings/business
- Business/company name (editable)
- Business type (dropdown)
- Currency (dropdown: NGN, USD, GBP, etc)
- Logo upload → uploads to Supabase Storage
- Business address (optional)
- Save button

#### /settings/subscription
- Current plan card with features list
- Usage stats: receipts this month · clients · staff members
- Plan comparison table: all 9 plans side by side
- Upgrade button → initialises Paystack checkout
- Cancel subscription button (with confirmation)
- Billing history table (from subscription_events)

#### /settings/accountant
- Current share link display (if active)
- Generate New Link button
- Copy Link button
- Set expiry date option
- Permission toggle: Read only vs Read + Export
- Revoke Link button
- "Your accountant visits: /accountant/[token]" instruction

#### /accountant/[token]
- Validates token against share_links table
- No login required
- If expired → "This link has expired. Ask your accountant to generate a new one."
- If valid → read-only view:
  - Organisation name + logo in header
  - Date range filter
  - Spending summary cards
  - Receipt table (view only — no edit/delete)
  - Reports with charts
  - Export PDF / Excel buttons
  - "Powered by TrueFlow" footer

#### /pricing
- Public page — no login needed
- All plans with feature comparison
- "Get started free" and "Upgrade" buttons
- FAQ section

### How WhatsApp Bot Data Flows Into the Web App

1. Receipt scanned via WhatsApp bot
   → Saved to `receipts` table with `uploaded_via = 'whatsapp'` and `image_url`
   → Web app reads it via Supabase Realtime subscription
   → Appears in /receipts with ChannelBadge "via WhatsApp"
   → /receipts/[id] shows the receipt image + AI transcript side by side
   → User can click "Attach to client" to link it to a client folder

2. Client payment receipt forwarded via WhatsApp
   → Bot creates `client_payments` record with `receipt_image_url`
   → Appears in /income and in the relevant /clients/[id] folder automatically

3. Budget set via WhatsApp
   → Saved to `budgets` table
   → Shows in /budgets with progress bars immediately

4. Reminder set via WhatsApp
   → Saved to `reminders` table
   → Shows in /reminders with edit/dismiss options

5. New client created via WhatsApp
   → Saved to `clients` table with `created_via = 'whatsapp'`
   → Folder appears in /clients automatically

### Paystack Subscription Flow

1. User clicks "Upgrade" in /settings/subscription
2. POST /api/paystack/initialize → creates Paystack transaction
3. Redirect to Paystack checkout page
4. User pays
5. Paystack sends webhook to /api/paystack/webhook
6. Webhook handler:
   - Verifies Paystack signature using PAYSTACK_WEBHOOK_SECRET
   - Parses event type: 'subscription.create' | 'subscription.disable' | 'charge.success'
   - Updates `organizations.plan` and `organizations.paystack_subscription_status`
   - Logs to `subscription_events` table
7. User redirected back to /settings/subscription
8. Page shows new plan — features unlock immediately

### Module Build Order for Claude Code

Build in this exact order — each module depends on the previous:

1. Auth (login, signup, reset-password, callback, middleware)
2. Settings/profile + settings/business (user can update name, business name, avatar)
3. Dashboard (pulls real data from Supabase — receipts, budgets, reminders)
4. Receipts page + receipt detail (with image viewer + AI transcript)
5. Reports page + PDF/Excel export
6. Budgets page + Reminders page
7. Clients pages (/clients, /clients/[id])
8. Projects pages (/projects, /projects/[id])
9. Income page
10. Invoices (list, new, detail, PDF generation)
11. Team management page
12. Paystack subscription flow + /settings/subscription
13. Accountant share link + /accountant/[token] portal
14. /pricing public page

---

## Key Business Rules

1. Free tier: capped at 10 receipts/month. Enforce in both bot AND web upload.
2. Client CRM requires SME Starter, Freelancer, or higher plan.
3. Staff scan via WhatsApp without a web account — linked by phone number only.
4. Accountant share links: read-only, expire in 30 days, stored in share_links table.
5. Receipt images: Supabase Storage path `/receipts/{org_id}/{uuid}.jpg`
6. Client payment images: `/client-receipts/{org_id}/{client_id}/{uuid}.jpg`
7. Invoice PDFs: `/invoices/{org_id}/{invoice_id}.pdf`
8. Organisation logos: `/logos/{org_id}/logo.{ext}`
9. User avatars: `/avatars/{user_id}/avatar.{ext}`
10. Weekly summaries: every Sunday 8am WAT (bot sends via WhatsApp).
11. Monthly reports: 1st of month 9am WAT (bot sends via WhatsApp).
12. Budget alerts fire at 80% and 100% — bot sends WhatsApp + web shows banner.
13. Project reminders: 7 days before, 3 days before, day of, overdue, unpaid balance.
14. Conversation history: keep last 50 messages per phone number in whatsapp_conversations.
15. `uploaded_via` always set: 'whatsapp' | 'web' | 'mobile' — never null.
16. `clients` = people who pay YOU. `org_members` = YOUR staff. Never confuse these.
17. `receipts` = YOUR expenses going out. `client_payments` = money coming IN from clients.
18. `balance_due` on projects is a generated column — never update it directly.
19. Paystack webhook must verify signature before processing — never skip this.
20. Always use RLS — never query with service_role_key from client-side code.
21. All amounts stored as numeric(12,2) — display with .toLocaleString() + currency symbol.
22. Dates always stored as ISO 8601. Display as "14 June 2025" not "06/14/25".

---

## Client Management — Bot Commands

| User sends | Bot does |
|------------|---------|
| CLIENTS | Lists all active clients with outstanding balances |
| CLIENT [name] | Shows full folder — projects, payments, balance |
| PROJECTS | Lists all active projects with deadlines |
| OVERDUE | Shows projects past their deadline |
| UNPAID | Shows all clients with outstanding balances |
| BALANCE | Total outstanding across all clients |
| NEW CLIENT | Starts guided client creation flow |
| PAID [client] | Records balance as fully received |
| DELIVERED [project] | Marks project as delivered |
| INVOICE [client] | Generates invoice PDF |

---

## Automatic Project Reminders

When a project is created (via bot or web), these reminders auto-create:
1. 7 days before deadline: "⚠️ [Project] for [Client] due in 7 days"
2. 3 days before deadline: "🔴 [Project] for [Client] due in 3 days"
3. On deadline day: "📅 [Project] for [Client] delivery due TODAY"
4. If delivered but balance unpaid after 3 days: "💰 ₦X balance from [Client] not received"
5. If overdue: "❗ [Project] for [Client] is [N] days overdue"

---

## Target Users

**Expense Tracking (MONEY OUT):**
Nigerian SME owners, market traders, boutiques, logistics, food businesses,
freelancers with staff. Currently tracking on WhatsApp, paper, or Excel.

**Client CRM (MONEY IN):**
Freelancers (designers, developers, writers, consultants),
agencies (marketing, creative, PR, digital),
service businesses (lawyers, accountants, photographers, event planners).

**International (Phase 3 mobile app+):**
Ghana, Kenya, UK, South Africa, Pakistan, Brazil.
Same product, same infrastructure — different Paystack/Stripe config.

---

## Reminder Categories

| Category | Examples |
|----------|---------|
| tax | VAT filing, PAYE, company income tax, withholding tax |
| salary | Monthly salary, pension, leave allowances |
| supplier | Invoice due dates, credit terms, reorder stock |
| bill | Rent, electricity, generator fuel, internet, water |
| compliance | CAC annual returns, NAFDAC renewals, business permits |
| operations | Petty cash replenishment, generator maintenance |
| project_deadline | Client project delivery date |
| custom | Anything the user specifies |

---

## Brand Identity

### Name & Pronunciation
- Written: **TrueFlow**
- Pronounced: **True-Flow** (exactly like "True Flow" said together)
- Phonetic: /truː.fləʊ/
- Never write: Truelio, TrueFlio, Trueflio, TRUEFLIO, true flow, true flio

### Dual Meaning
| Layer | Meaning |
|-------|---------|
| Written | True + Flow → "Your True Financial Flow" |

### Taglines
- Primary: *"Your true financial flow."*
- Action: *"Scan. Track. Plan."*
- Trust: *"The truth about your money."*

### Logo
- Mark: Geometric interlocking TF letterform inside a rounded square
- T shape: vertical stem + crossbar (white on violet)
- F shape: offset below T, sharing the crossbar as its top bar (white, slightly transparent)
- Teal bubble: bottom-right of the mark, contains a checkmark — means "verified / true"
- Wordmark: "True" in serif white · "Flio" in Electric Violet · "TRUE-FLOW" in small caps below
- The wave (flow line) replaces the word "Flow" in the logotype — it IS the word

### Brand Colours
| Name | Hex | Usage |
|------|-----|-------|
| Electric Violet | `#6C63FF` | Primary — buttons, CTAs, "Flio" wordmark, icon bg |
| Mint Verify | `#00D4AA` | Logo checkmark, success states, verified receipts |
| Rich Black | `#0A0A0F` | Dark backgrounds, primary text on light |
| Cloud White | `#F5F5F7` | Light backgrounds, cards |
| Alert Red | `#FF6B6B` | Errors, overdue, failed payments |
| Warn Amber | `#FFB545` | Budget warnings, approaching deadlines |
| WhatsApp Green | `#25D366` | Always use this exact hex for WhatsApp channel badges |

### Channel Badges (always use these exact styles)
- `via WhatsApp` → bg: rgba(37,211,102,0.1), text: #25D366
- `via Web` → bg: rgba(108,99,255,0.1), text: #6C63FF
- `via App` → bg: rgba(255,181,69,0.1), text: #FFB545

### Typography
| Role | Font | Weight |
|------|------|--------|
| Display / Logo | Georgia, Playfair Display, serif | 700 |
| UI Headings | Space Grotesk, system-ui | 600–700 |
| Body / UI | Inter, DM Sans, system-ui | 400–500 |
| Labels | Syne, system-ui | 600–700 |
| Numbers / Data | JetBrains Mono, monospace | 400–500 |

### Brand Voice
- Warm and direct — smart friend who is also an accountant
- Honest — if spending is a problem, say so clearly but kindly
- Concise — never more words than needed
- Nigerian-aware — supports Pidgin English in the bot
- Amounts: always ₦1,500 not ₦1500 · Dates: "14 June 2025" not "06/14/25"

---

## Claude Code Instructions

When I ask you to build something:
1. Always read this CLAUDE.md first
2. Read the relevant /docs/ spec file for detail
3. TypeScript everywhere — no plain JavaScript
4. async/await only — no callbacks or .then() chains
5. Always destructure Supabase: `const { data, error } = await supabase...`
6. Always check error: `if (error) throw new Error(error.message)`
7. Never hardcode API keys — use environment variables only
8. Never use supabase service_role_key in client-side/browser code
9. Add a JSDoc comment at the top of every file describing what it does
10. Keep functions small and single-purpose
11. Log errors with context: `console.error('functionName failed:', err)`
12. Chat model: claude-haiku-4-5-20251001
13. Vision/scanning model: claude-opus-4-6
14. `clients` = people who pay YOU. `org_members` = YOUR staff.
15. `receipts` = YOUR expenses out. `client_payments` = money IN from clients.
16. `balance_due` is a generated column on projects — never update it directly
17. Always verify Paystack webhook signature before processing
18. Use TrueFlow brand colours from this file for any UI components built
19. When in doubt about a feature, ask before building the wrong thing

---

## Smart Transfer Recognition — Core Feature Spec

### What It Is

Smart Transfer Recognition is TrueFlow's signature income-tracking feature.
When a client sends a payment proof (transfer screenshot) to an SME owner via
WhatsApp or Instagram, the owner forwards it to the TrueFlow WhatsApp bot.
The AI reads the screenshot, extracts all payment data, matches the sender to
an existing client or creates a new one, and logs the income automatically.

This is built specifically for Nigerian and African SMEs where:
- Clients always send payment proof via WhatsApp or Instagram after paying
- SME owners receive these screenshots but do nothing with them
- No record is kept, no tracking happens, money is lost in chat history
- TrueFlow turns every forwarded screenshot into a tracked income record

### Feature Name
- Technical name: Smart Transfer Recognition
- User-facing name: Smart Transfer Recognition
- WhatsApp bot trigger message: "📥 Payment proof received"
- Marketing line: "Forward it. We'll figure it out."

### Supported Screenshot Types
TrueFlow reads payment screenshots from ALL Nigerian banks and payment apps:

| Bank / App | What Claude reads |
|-----------|-----------------|
| GTBank | Amount, sender name, account, date, reference |
| Access Bank | Amount, sender, narration, date, transaction ID |
| Zenith Bank | Amount, from account, date, session ID |
| UBA | Amount, originator, date, reference |
| First Bank | Amount, sender, date, transaction ref |
| Opay | Amount, sender name, phone, date |
| Palmpay | Amount, sender name, date, transaction ref |
| Moniepoint | Amount, sender, date, reference |
| Kuda | Amount, sender, date, reference |
| Any bank | Claude reads whatever text is visible |

### Detection Logic — Income vs Expense
When an image arrives at the bot, Claude determines direction of money:

INCOMING (client paying owner) — signals:
- "Credit alert", "You have received", "Transfer credit"
- "We have credited your account", "Inflow", "CR"
- "Payment received", "Successful transfer to you"

OUTGOING (owner paying someone) — signals:
- "Debit alert", "Payment made", "You have paid"
- "POS purchase", "Transfer debit", "DR"
- "Receipt for purchase"

If ambiguous → always ask: "Is this money you received from a client,
or an expense you paid?" Never assume direction.

### Full Bot Conversation Flow

```
Owner forwards payment screenshot
            ↓
Claude Vision reads image → extracts:
{
  "detection": "incoming_payment",
  "amount": 150000,
  "currency": "NGN",
  "sender_name": "MARCUS ADEBAYO",
  "bank": "GTBank",
  "reference": "FT25067382910",
  "date": "2025-06-14",
  "narration": "Payment for website",
  "confidence": "high"
}
            ↓
Bot checks clients table for sender_name match
            ↓
    MATCH FOUND              NO MATCH
         ↓                       ↓
"✅ Payment received!      "📥 Payment received!
 ₦150,000 from             ₦150,000 from
 Marcus Adebayo            MARCUS ADEBAYO
 (GTBank)                  on 14 June 2025.

 Is this for an            I don't have a client
 existing project?         with this name.

 Reply YES — log it        Reply 1 — Create new
 to his account            client folder
 Reply NO — skip           Reply 2 — Match to
 Reply PROJECT — pick      existing client
 a specific project"       Reply 3 — Skip"
         ↓                       ↓
  Owner: YES              Owner: 1
         ↓                       ↓
"Which project?           "What is the client's
 1. Website design         full name or business
    Balance: ₦300,000      name?"
 2. Logo & branding
    Balance: ₦50,000"     Owner: "Marcus Adebayo
         ↓                 Ventures"
  Owner: 1                       ↓
         ↓                "✅ New client created:
"✅ Logged!               Marcus Adebayo Ventures

 Marcus Adebayo           What is this ₦150,000
 Website design           payment for?
 ₦150,000 received        Reply or type project
 Balance remaining:       name."
 ₦150,000

 Invoice updated.
 Web dashboard
 updated."
```

### What Happens in Supabase

On every successful Smart Transfer Recognition:

1. Insert into `client_payments`:
   - amount, currency, payment_date
   - sender_name (from screenshot)
   - bank (detected from screenshot)
   - payment_reference (from screenshot)
   - receipt_image_url (stored in Supabase Storage)
   - ai_transcript (full text Claude read)
   - payment_type: 'transfer'
   - client_id (matched or newly created)
   - project_id (if owner linked it)

2. Update `clients`:
   - total_earned += amount
   - outstanding_balance -= amount (if linked to project)
   - updated_at = now()

3. Update `projects` (if linked):
   - amount_received += amount
   - balance_due auto-updates (generated column)
   - If amount_received >= total_fee → suggest marking as completed

4. Update `invoices` (if linked):
   - If payment covers full remaining balance → status = 'paid', paid_at = now()
   - If partial → status stays 'sent', notes updated

5. Store image:
   - Path: `/client-receipts/{org_id}/{client_id}/{timestamp}.jpg`
   - Public URL saved to client_payments.receipt_image_url

6. Supabase Realtime fires:
   - Web app dashboard updates instantly
   - Mobile app updates instantly
   - Income widget shows new payment
   - Client folder shows updated balance

### Nigerian Bank Screenshot Storage Path
`/client-receipts/{org_id}/{client_id}/{YYYY-MM-DD}-{reference}.jpg`

### New Files Needed in Bot
- `transfer-detector.ts` — detects if image is incoming payment vs expense
- `bank-reader.ts` — bank-specific extraction logic for Nigerian banks
- Update `receipt-scanner.ts` — add incoming payment branch
- Update `message-handler.ts` — route to transfer-detector first

### Claude Vision Prompt for Transfer Screenshots

```typescript
const TRANSFER_PROMPT = `
You are reading a Nigerian bank transfer screenshot or payment proof.
Extract all visible information and return ONLY valid JSON:
{
  "detection": "incoming_payment" | "outgoing_payment" | "unknown",
  "amount": number,
  "currency": "NGN" (or detected currency),
  "sender_name": "string or null",
  "recipient_name": "string or null",
  "bank": "detected bank name or null",
  "payment_reference": "string or null",
  "transaction_id": "string or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "narration": "string or null",
  "account_number": "last 4 digits only or null",
  "confidence": "high | medium | low"
}

Nigerian banks to recognise: GTBank, Access Bank, Zenith Bank, UBA,
First Bank, Opay, Palmpay, Moniepoint, Kuda, Stanbic, Sterling,
Wema, FCMB, Polaris, Union Bank, Providus, Jaiz.

If the screenshot is not a payment proof, set detection to "unknown".
`
```

### UI Labels Across All Channels

| Context | Label |
|---------|-------|
| WhatsApp bot reply | "📥 Payment proof received" |
| Web app section | Income → Payments Received |
| Web app column | "Transfer In" channel badge |
| Client folder tab | "Payment History" |
| Dashboard widget | "Recent Transfers In" |
| Mobile home screen | "Income" quick stat |
| Receipt detail | "Proof of Payment" image |
| Feature name in settings | "Smart Transfer Recognition" |
| Onboarding tooltip | "Forward any payment proof to this number" |

### Transfer In Channel Badge
- Label: `Transfer In`
- Background: rgba(0,212,170,0.1)
- Text colour: #00D4AA (Mint Verify)
- Different from expense receipts which use channel badges (WhatsApp/Web/App)

### Marketing Copy for This Feature

Headline: "Forward it. We'll figure it out."
Sub: "When clients send you payment proof on WhatsApp, forward it to TrueFlow.
     We read the screenshot, find the client, and update your books automatically.
     Works with every Nigerian bank."

Feature card title: "Smart Transfer Recognition"
Feature card desc: "Forward any client payment screenshot to TrueFlow on WhatsApp.
                   We read the amount, match the client, and log the income instantly
                   — visible on your web app and mobile in seconds."

### Business Rules for Smart Transfer Recognition

1. Always store the original screenshot image — never discard it
2. Never auto-create a client without owner confirmation
3. Never auto-link to a project without owner confirmation
4. If confidence is "low" → show extracted data and ask owner to confirm each field
5. If sender_name matches multiple clients → show list and ask owner to pick
6. Partial name matches (e.g. "MARCUS" matches "Marcus Adebayo") → show suggestion
7. After logging → always show updated project balance and outstanding amount
8. If payment exceeds project balance → ask owner: "This payment of ₦X exceeds the
   remaining balance of ₦Y. Is this for a different project or a new engagement?"
9. Store bank name in payment record — useful for future bank-specific parsing improvements
10. Instagram screenshots: owner saves image from Instagram and forwards to WhatsApp bot
    — same flow, same detection. No special handling needed.
