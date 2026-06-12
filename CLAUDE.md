# TrueFlio — Master Project Brief
> This file is read automatically by Claude Code on every session.
> Do not delete it. Keep it updated as the project evolves.

---

## What Is TrueFlio

TrueFlio is an AI-powered conversational financial assistant for small business owners.
It combines receipt scanning, expense tracking, budget management, reminders, and
financial planning — delivered across three channels that share one backend.

Company legal name: **True Financial Portfolio Ltd**
Brand name: **TrueFlio**
Tagline: *"Your true financial portfolio."*
Domain: trueflio.com
App URL: app.trueflio.com
Email: hello@trueflio.com

---

## The Product Trinity — Three Channels, One Backend

```
WhatsApp Bot  →  Conversational AI assistant. Scan receipts, chat about finances,
                 set budgets, set reminders — all via natural language in WhatsApp.

Mobile App    →  On the go. Camera scanner, visual dashboard, push notifications.

Web App       →  Full power. Deep analytics, accountant portal, bulk import, admin.
```

All three channels share the same Supabase backend, auth, and real-time data.
One user account works across all three. Scan on WhatsApp → see it on web instantly.

**Build order:**
1. WhatsApp Bot — Phase 1. Build first. Validate market. Earn first revenue.
2. Web App — Phase 2. Same Supabase backend. Deploy to app.trueflio.com.
3. Mobile App — Phase 3. Same Supabase backend. React Native + Expo.

---

## Tech Stack

### Shared Backend (all three channels use this)
- **Database + Auth + Storage + Realtime**: Supabase (PostgreSQL)
- **AI — Receipt Scanning**: Anthropic Claude Vision API
- **AI — Conversational Assistant**: Anthropic Claude Messages API
- **Model**: claude-opus-4-6 (use this model string everywhere)
- **Payments**: Paystack (Nigeria), Stripe (international — future)
- **PDF Generation**: html-pdf or Puppeteer via Supabase Edge Function

### WhatsApp Bot (Phase 1)
- Runtime: Node.js + TypeScript
- Framework: Express.js
- WhatsApp API: Twilio WhatsApp Business API
- Hosting: Railway.app (free tier)
- Scheduling: node-cron

### Web App (Phase 2)
- Framework: Next.js 14 App Router + TypeScript
- Styling: Tailwind CSS + shadcn/ui
- Charts: Recharts
- Tables: TanStack Table
- Hosting: Vercel (free tier)

### Mobile App (Phase 3)
- Framework: React Native + Expo + TypeScript
- Navigation: Expo Router
- Charts: Victory Native
- Camera: Expo Camera + ImagePicker
- Notifications: Expo Notifications
- Auth storage: expo-secure-store

---

## Environment Variables

Create a `.env` file in each sub-project root. Never commit it to git.

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (Claude Vision + Chat)
ANTHROPIC_API_KEY=

# Twilio (WhatsApp Bot)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Paystack
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=

# App URLs
WEBAPP_URL=https://app.trueflio.com
PRICING_PAGE_URL=https://trueflio.com/pricing
```

---

## Complete Database Schema

Run this entire block in the Supabase SQL editor to create all tables.

```sql
-- ── PROFILES ──────────────────────────────────────────────────────────
-- Extends Supabase auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  avatar_url text,
  expo_push_token text,        -- for mobile push notifications
  created_at timestamptz default now()
);

-- ── ORGANIZATIONS ─────────────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'sme',     -- 'sme' | 'family' | 'individual'
  owner_id uuid references profiles(id),
  plan text default 'free',    -- 'free' | 'solo' | 'business' | 'pro' | 'enterprise'
  receipt_limit int default 10,
  currency text default 'NGN',
  paystack_customer_id text,
  paystack_subscription_id text,
  created_at timestamptz default now()
);

-- ── ORG MEMBERS ───────────────────────────────────────────────────────
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'staff',   -- 'owner' | 'admin' | 'staff' | 'accountant'
  whatsapp_number text,        -- '+2348012345678'
  whatsapp_active boolean default true,
  invited_at timestamptz default now(),
  joined_at timestamptz,
  unique(org_id, user_id)
);

-- ── RECEIPTS ──────────────────────────────────────────────────────────
create table receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  uploaded_via text default 'app',  -- 'whatsapp' | 'app' | 'web'
  vendor_name text,
  amount numeric(12,2),
  currency text default 'NGN',
  tax_amount numeric(12,2),
  date date default current_date,
  category text default 'Other',
  -- Valid categories:
  -- 'Food & Drink' | 'Transport' | 'Utilities' | 'Office Supplies'
  -- 'Marketing' | 'Rent' | 'Salaries' | 'Other'
  notes text,
  image_url text,
  ai_confidence text,           -- 'high' | 'medium' | 'low'
  is_verified boolean default false,
  created_at timestamptz default now()
);

-- ── BUDGETS ───────────────────────────────────────────────────────────
create table budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null,
  period text default 'monthly',  -- 'monthly' | 'weekly'
  month int,
  year int,
  created_at timestamptz default now(),
  unique(org_id, category, month, year)
);

-- ── REMINDERS ─────────────────────────────────────────────────────────
create table reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  title text not null,
  due_date date not null,
  recurrence text default 'once', -- 'once'|'daily'|'weekly'|'monthly'|'yearly'
  category text default 'custom', -- 'tax'|'salary'|'supplier'|'bill'|'compliance'|'custom'
  status text default 'active',   -- 'active' | 'fired' | 'dismissed'
  fired_at timestamptz,
  created_at timestamptz default now()
);

-- ── WHATSAPP CONVERSATIONS ────────────────────────────────────────────
-- Stores chat history per phone number for Claude's memory
create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  role text not null,             -- 'user' | 'assistant'
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
  status text default 'upcoming', -- 'upcoming' | 'paid' | 'overdue'
  created_at timestamptz default now()
);

-- ── INVOICES ──────────────────────────────────────────────────────────
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_name text,
  client_email text,
  line_items jsonb,               -- [{description, quantity, unit_price, total}]
  subtotal numeric(12,2),
  tax_amount numeric(12,2),
  total_amount numeric(12,2),
  status text default 'draft',   -- 'draft' | 'sent' | 'paid'
  due_date date,
  created_at timestamptz default now()
);

-- ── ACCOUNTANT SHARE LINKS ────────────────────────────────────────────
create table share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  token text unique default gen_random_uuid()::text,
  permission text default 'read', -- 'read' | 'export'
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- ── SUBSCRIPTION EVENTS ───────────────────────────────────────────────
create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  event_type text,
  payload jsonb,
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
alter table invoices enable row level security;

create policy "Users see own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Org members see their org receipts"
  on receipts for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "Org members insert receipts"
  on receipts for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "Org members see budgets"
  on budgets for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "Org owners manage budgets"
  on budgets for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
```

---

## Pricing Plans

| Plan | Price NGN | Price USD | Receipts | Users | Key Features |
|------|-----------|-----------|----------|-------|-------------|
| Free | ₦0 | $0 | 10/month | 1 | Basic dashboard, PDF export |
| Solo | ₦3,000/mo | $5/mo | Unlimited | 1 | All features, no team |
| Business | ₦6,000/mo | $9/mo | Unlimited | 5 | Team, tax tracking, accountant link |
| Business Pro | ₦12,000/mo | $19/mo | Unlimited | 15 | Invoices, advanced analytics |
| Enterprise | Custom | Custom | Unlimited | Unlimited | Custom everything |

---

## Key Business Rules

1. Free tier: capped at 10 receipts/month. Bot and app both enforce this.
2. Staff scan via WhatsApp without needing an app account — linked by phone number only.
3. Accountant share links are read-only and expire in 30 days unless renewed.
4. Receipt images stored in Supabase Storage: `/receipts/{org_id}/{timestamp}.jpg`
5. Weekly summaries sent every Sunday at 8am WAT (UTC+1).
6. Monthly PDF reports sent 1st of every month at 9am WAT.
7. Budget alerts fire at 80% and 100% of budget limit.
8. Reminders fire at 8am WAT on the due date + 3 days in advance.
9. Conversation history: keep last 50 messages per phone number.
10. The `uploaded_via` field tracks channel: 'whatsapp' | 'app' | 'web'.
11. Claude model string: always use `claude-opus-4-6`.
12. All money stored as numeric(12,2). Display with toLocaleString().

---

## Target Users

**Primary (Phase 1):** Nigerian SME owners — market traders, boutiques, logistics,
food businesses, freelancers with staff. Currently tracking on WhatsApp, paper, Excel.

**Secondary:** Family households tracking shared expenses.

**International (Phase 3+):** Ghana, Kenya, UK, South Africa, Pakistan, Brazil.
Same product, same infrastructure — just different Paystack/Stripe config.

---

## Reminder Categories TrueFlio Understands

| Category | Examples |
|----------|---------|
| tax | VAT filing, PAYE, company income tax, withholding tax |
| salary | Monthly salary, pension contributions, leave allowances |
| supplier | Invoice due dates, credit terms, reorder stock |
| bill | Rent, electricity, generator fuel, internet, water |
| compliance | CAC annual returns, NAFDAC renewals, business permits |
| operations | Petty cash replenishment, generator maintenance, vehicle service |
| custom | Anything else the user specifies |

---

## Claude Code Instructions — How to Work With This Project

When I ask you to build something:
1. Always read CLAUDE.md first (this file)
2. Read the relevant /docs/ spec file for the current phase
3. Use TypeScript everywhere — no plain JavaScript files
4. Use async/await only — no callbacks or .then() chains
5. Always wrap Supabase calls: `const { data, error } = await supabase...`
6. Always check error: `if (error) throw new Error(error.message)`
7. Never hardcode API keys — always use `process.env.VARIABLE_NAME`
8. Add a comment block at the top of every file describing what it does
9. Keep functions small and single-purpose — one job per function
10. Log errors with context: `console.error('functionName failed:', err)`
11. Claude model string is always: `claude-opus-4-6`
12. When in doubt about a feature, check the relevant /docs/ spec file
