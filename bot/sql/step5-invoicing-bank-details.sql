-- Step 5 — Run this entire block in Supabase SQL Editor (safe to re-run)
--
-- Adds bank account fields to organizations — the default/fallback payment
-- method shown on every invoice, independent of whether a payment-link
-- integration (Paystack/Flutterwave) exists. Captured once (asked by the
-- bot the first time an org creates an invoice with none saved), then
-- reused on every future invoice. Editable later via the web dashboard.

alter table organizations
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_name text;
