// lib/plans.ts
// Single source of truth for TrueFlow's plan/pricing structure. Every place
// that used to keep its own ad hoc Record<string, number> for staff/client/
// receipt limits (team/invite, admin/change-plan, admin/update-user,
// admin/revenue, flutterwave routes, settings/subscription, pricing page)
// now imports from here instead — the old scattered-duplicate-maps pattern
// is exactly how a plan rename like this one silently misses a spot.
//
// Live tiers (self-serve, via Flutterwave — see PLATFORM DECISION below):
//   free_trial, free, individual, business, business_pro
// Enterprise is NOT self-serve — no checkout, no price shown. It is only
// ever assigned manually via /admin (see app/api/admin/change-plan).
//
// PLATFORM DECISION (2026-07): Flutterwave is the billing provider going
// forward — it's the one the live Settings → Subscription page already
// calls. Paystack's integration (app/api/paystack/*) still exists in the
// codebase using the OLD plan names/amounts, but is not linked from any UI
// and was intentionally left as-is (dead code) rather than updated, since
// maintaining two live plan-code maps was explicitly ruled out.
//
// DEPRECATED PLAN NAMES: organizations.plan is a plain text column (no DB
// enum/check constraint), so old values like 'sme_starter' or 'freelancer'
// just sit there readable but never matched by PLAN_CONFIG below. Never
// read org.plan directly for feature checks — always go through
// resolvePlan() first, so a not-yet-migrated org degrades to a sensible
// current tier instead of matching nothing.

export type PlanId = 'free_trial' | 'free' | 'individual' | 'business' | 'business_pro' | 'enterprise'

export const SELF_SERVE_PLAN_IDS: PlanId[] = ['individual', 'business', 'business_pro']

export interface PlanConfig {
  id: PlanId
  label: string
  monthlyNgn: number // 0 for free/free_trial, -1 = "Custom" (enterprise)
  receiptLimit: number // -1 = unlimited
  clientLimit: number // -1 = unlimited, 0 = no client CRM
  staffLimit: number // -1 = unlimited — Business/Business Pro are NEVER headcount-gated
  taxHub: 'none' | 'basic' | 'advanced' // advanced = quarterly/yearly reporting
  invoiceBranding: boolean // custom logo on generated invoice PDFs
  selfServe: boolean
}

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  free_trial:  { id: 'free_trial',  label: 'Free Trial',   monthlyNgn: 0,     receiptLimit: -1, clientLimit: -1, staffLimit: -1, taxHub: 'advanced', invoiceBranding: true,  selfServe: false },
  free:        { id: 'free',        label: 'Free',         monthlyNgn: 0,     receiptLimit: 10, clientLimit: 0,  staffLimit: 1,  taxHub: 'none',     invoiceBranding: false, selfServe: false },
  individual:  { id: 'individual',  label: 'Individual',   monthlyNgn: 2500,  receiptLimit: -1, clientLimit: 0,  staffLimit: 1,  taxHub: 'basic',    invoiceBranding: false, selfServe: true  },
  business:    { id: 'business',    label: 'Business',     monthlyNgn: 5000,  receiptLimit: -1, clientLimit: -1, staffLimit: -1, taxHub: 'basic',    invoiceBranding: false, selfServe: true  },
  business_pro:{ id: 'business_pro',label: 'Business Pro', monthlyNgn: 10000, receiptLimit: -1, clientLimit: -1, staffLimit: -1, taxHub: 'advanced', invoiceBranding: true,  selfServe: true  },
  enterprise:  { id: 'enterprise',  label: 'Enterprise',   monthlyNgn: -1,    receiptLimit: -1, clientLimit: -1, staffLimit: -1, taxHub: 'advanced', invoiceBranding: true,  selfServe: false },
}

// ── FLAGGED — needs product confirmation before shipping to real users ──
// Annual billing discount shown on the pricing page. 15% is a placeholder
// from the ticket, explicitly NOT confirmed as final.
export const ANNUAL_DISCOUNT_PCT = 15

// Family add-on price stacked on top of Individual (per ticket: "+optional
// Family add-on, +₦2,500/month"). Not yet wired into checkout — flagged
// here so it has one obvious home when that's built.
export const FAMILY_ADDON_NGN = 2500

// Placeholder — NOT finalized. Number of invoices/month at which a
// Business-tier org gets a soft "consider Business Pro" nudge (never a
// hard block; Business has no invoice/client caps). Flag back before
// tuning this for real.
export const BUSINESS_INVOICE_NUDGE_THRESHOLD = 20

// Placeholder — NOT finalized. Post-trial Free tier caps, per Feature 3.
// Flag back before shipping; these are guesses to make the downgrade
// mechanism functional, not product-approved numbers.
export const FREE_TIER_RECEIPT_LIMIT = 10
export const FREE_TIER_REMINDER_LIMIT = 5
export const FREE_TIER_CLIENT_LIMIT = 0

export const TRIAL_DAYS = 14

// ── Deprecated → current mapping ─────────────────────────────────────────
// Confirmed 2026-07-23: only one live org ("Big Dee", sme_starter) was on
// any deprecated name, with no real Paystack customer/subscription attached
// (a manual admin test override, not a paying subscriber) — approved for
// direct remap. See bot/sql/step10-plan-rename-migration.sql for the
// one-time backfill actually applied to existing rows. This map exists
// so reads never silently fail for any row the backfill missed.
export const DEPRECATED_PLAN_MAP: Record<string, PlanId> = {
  solo: 'individual',       // dead/unused alternate scheme found in prior code
  pro: 'business_pro',      // dead/unused alternate scheme found in prior code
  family: 'individual',     // old standalone Family tier folded into Individual + add-on
  freelancer: 'business',
  sme_starter: 'business',
  agency: 'business_pro',
  sme_pro: 'business_pro',
  studio: 'business_pro',
}

// Always call this before treating org.plan as a PlanId — handles rows a
// migration hasn't reached yet without ever throwing or matching nothing.
export function resolvePlan(rawPlan: string | null | undefined): PlanId {
  if (!rawPlan) return 'free'
  if (rawPlan in PLAN_CONFIG) return rawPlan as PlanId
  return DEPRECATED_PLAN_MAP[rawPlan] ?? 'free'
}

export function getPlanConfig(rawPlan: string | null | undefined): PlanConfig {
  return PLAN_CONFIG[resolvePlan(rawPlan)]
}

export function canUseAdvancedTaxHub(rawPlan: string | null | undefined): boolean {
  return getPlanConfig(rawPlan).taxHub === 'advanced'
}

export function canUseInvoiceBranding(rawPlan: string | null | undefined): boolean {
  return getPlanConfig(rawPlan).invoiceBranding
}

// Business/Business Pro are explicitly NEVER headcount-gated (staffLimit
// -1). Only Free/Individual (staffLimit 1) actually block invites.
export function staffLimitFor(rawPlan: string | null | undefined): number {
  return getPlanConfig(rawPlan).staffLimit
}

export function receiptLimitFor(rawPlan: string | null | undefined): number {
  return getPlanConfig(rawPlan).receiptLimit
}

export function clientLimitFor(rawPlan: string | null | undefined): number {
  return getPlanConfig(rawPlan).clientLimit
}
