-- Step 2 — Run this entire block in Supabase SQL Editor (safe to re-run)
-- Adds: default_tax_country column on organizations
--       tax_rate_reference table + seed data (reference rates, not live/guaranteed)
--       tax_estimates table (logs calculated estimates per organization)
--
-- Tax Hub is a tracking and estimating tool, not a tax filing or guaranteed-accurate
-- calculator. tax_rate_reference always carries last_verified_date so the UI/AI can
-- show when a rate was last checked, never presenting it as permanently current.

-- ── DEFAULT TAX COUNTRY ────────────────────────────────────────────────────────
alter table organizations
  add column if not exists default_tax_country text default 'Nigeria';

update organizations
set default_tax_country = case currency
  when 'NGN' then 'Nigeria'
  when 'KES' then 'Kenya'
  when 'GHS' then 'Ghana'
  when 'USD' then 'USA'
  when 'GBP' then 'UK'
  else 'Nigeria'
end
where default_tax_country is null;

-- ── TAX RATE REFERENCE ──────────────────────────────────────────────────────────
create table if not exists tax_rate_reference (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  tax_type text not null,
  rate text not null,
  notes text,
  last_verified_date date not null,
  unique (country, tax_type)
);

insert into tax_rate_reference (country, tax_type, rate, notes, last_verified_date) values
  ('Nigeria', 'VAT', '7.5%', 'Standard rate, many basics zero-rated from Jan 2026', '2026-01-01'),
  ('Nigeria', 'Personal Income Tax', '0% to 25% progressive', 'First ₦800,000 tax-free, top rate 25% on highest earners', '2026-01-01'),
  ('Nigeria', 'Corporate Income Tax', '0% / 20% / 30%', '0% for small companies under ₦50M turnover, 20% medium, 30% large', '2026-01-01'),
  ('Kenya', 'VAT', '16%', 'Standard rate', '2026-01-01'),
  ('Kenya', 'Personal Income Tax', 'up to 35%', 'Progressive bands, top rate 35%', '2026-01-01'),
  ('Kenya', 'Corporate Income Tax', '30%', 'Standard rate for resident companies', '2026-01-01'),
  ('Ghana', 'VAT', '12.5%', 'Plus additional levies in practice', '2026-01-01'),
  ('Ghana', 'Personal Income Tax', 'up to 35%', 'Seven-band progressive structure', '2026-01-01'),
  ('Ghana', 'Corporate Income Tax', '25%', '30% for financial institutions', '2026-01-01'),
  ('USA', 'Sales Tax', 'varies by state', 'No national sales tax, set at state and local level, typically 0% to 10%+ depending on location', '2026-01-01'),
  ('USA', 'Federal Income Tax', 'up to 37%', 'Progressive federal bands, state income tax may apply separately', '2026-01-01'),
  ('USA', 'Corporate Tax', '21%', 'Flat federal rate, state corporate tax may apply separately', '2026-01-01'),
  ('UK', 'VAT', '20%', 'Standard rate, 5% reduced and 0% rates apply to some goods', '2026-01-01'),
  ('UK', 'Income Tax', 'up to 45%', 'Personal allowance £12,570, then 20% / 40% / 45% bands', '2026-01-01'),
  ('UK', 'Corporation Tax', '19% / 25%', '19% small profits rate under £50,000 profit, 25% main rate over £250,000, marginal relief between', '2026-01-01')
on conflict (country, tax_type) do update set
  rate = excluded.rate,
  notes = excluded.notes,
  last_verified_date = excluded.last_verified_date;

-- ── TAX ESTIMATES ────────────────────────────────────────────────────────────────
create table if not exists tax_estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  country text not null,
  estimated_taxable_income numeric(12,2) not null,
  estimated_liability numeric(12,2),
  tax_type text not null,
  calculated_at timestamptz default now()
);

create index if not exists tax_estimates_org_idx
  on tax_estimates (org_id, calculated_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────────
alter table tax_rate_reference enable row level security;
alter table tax_estimates enable row level security;

-- Reference rates are static, non-sensitive data — any authenticated user can read them
drop policy if exists "Authenticated users read tax rates" on tax_rate_reference;
create policy "Authenticated users read tax rates"
  on tax_rate_reference for select using (auth.role() = 'authenticated');

drop policy if exists "Org members see tax estimates" on tax_estimates;
create policy "Org members see tax estimates"
  on tax_estimates for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

drop policy if exists "Org members log tax estimates" on tax_estimates;
create policy "Org members log tax estimates"
  on tax_estimates for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
