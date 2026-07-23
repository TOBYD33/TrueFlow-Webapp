// lib/plans.ts
// Single source of truth for TrueFlow's plan/pricing structure. Every place
// that used to keep its own ad hoc Record<string, number> for staff/client/
// receipt limits (team/invite, admin/change-plan, admin/update-user,
// admin/revenue, flutterwave routes, settings/subscription, pricing page)
// now imports from here instead — the old scattered-duplicate-maps pattern
// is exactly how a plan rename like this one silently misses a spot.
//
// REVISION (2026-07, second pass): 'free_trial' as a separate plan id has
// been retired — zero live orgs were ever on it, confirmed before removing.
// Free is now the only entry tier, with a limited feature set from day one
// plus a 14-day window during which WhatsApp automation itself is active
// (see WHATSAPP_TRIAL_DAYS and canUseWhatsAppAutomation below).
//
// Live tiers (self-serve, via Flutterwave):
//   free, individual, business, business_pro
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
// FAMILY: intentionally has no trace anywhere in this file or either
// pricing surface. Planned as a standalone announcement ~2 months post
// launch — must look like it was never part of the plan, not delayed.
//
// DEPRECATED PLAN NAMES: organizations.plan is a plain text column (no DB
// enum/check constraint), so old values like 'sme_starter' or 'freelancer'
// just sit there readable but never matched by PLAN_CONFIG below. Never
// read org.plan directly for feature checks — always go through
// resolvePlan() first, so a not-yet-migrated org degrades to a sensible
// current tier instead of matching nothing.

export type PlanId = 'free' | 'individual' | 'business' | 'business_pro' | 'enterprise'

export const SELF_SERVE_PLAN_IDS: PlanId[] = ['individual', 'business', 'business_pro']

// Display labels differ slightly from the internal id per the ticket
// ("Business (Starter)" / "Business (Pro)") — UI should read displayLabel,
// not humanize the id.
export interface PlanConfig {
  id: PlanId
  label: string
  displayLabel: string
  tagline: string
  monthlyNgn: number // 0 for free, -1 = "Custom" (enterprise)
  scanLimit: number // -1 = unlimited. Covers business card + receipt scans together.
  clientLimit: number // -1 = unlimited, 0 = none
  automatedReminder: boolean
  staffLimit: number // -1 = unlimited, 0 = cannot invite ANY team member
  taxAnalysis: 'inactive' | 'basic' | 'advanced' // advanced = quarterly/yearly reporting
  invoiceBranding: boolean // custom logo on generated invoice PDFs
  supportPriority: boolean
  selfServe: boolean
  mostPopular: boolean
}

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free', label: 'Free', displayLabel: 'Free',
    tagline: '14-day trial, no card required',
    monthlyNgn: 0, scanLimit: 10, clientLimit: 5, automatedReminder: false,
    staffLimit: 0, taxAnalysis: 'inactive', invoiceBranding: false, supportPriority: false,
    selfServe: false, mostPopular: false,
  },
  individual: {
    id: 'individual', label: 'Individual', displayLabel: 'Individual',
    tagline: 'Track your own money, effortlessly',
    monthlyNgn: 2500, scanLimit: -1, clientLimit: 0, automatedReminder: true,
    staffLimit: 0, taxAnalysis: 'basic', invoiceBranding: false, supportPriority: false,
    selfServe: true, mostPopular: false,
  },
  business: {
    id: 'business', label: 'Business', displayLabel: 'Business (Starter)',
    tagline: 'For solo-run businesses ready to look professional',
    monthlyNgn: 5000, scanLimit: -1, clientLimit: -1, automatedReminder: true,
    // Team members intentionally inactive — this is the defining Business
    // Pro upsell, not a bug or oversight.
    staffLimit: 0, taxAnalysis: 'basic', invoiceBranding: true, supportPriority: false,
    selfServe: true, mostPopular: true,
  },
  business_pro: {
    id: 'business_pro', label: 'Business Pro', displayLabel: 'Business (Pro)',
    tagline: 'Add your team and go deeper on tax reporting',
    monthlyNgn: 10000, scanLimit: -1, clientLimit: -1, automatedReminder: true,
    staffLimit: -1, taxAnalysis: 'advanced', invoiceBranding: true, supportPriority: true,
    selfServe: true, mostPopular: false,
  },
  enterprise: {
    id: 'enterprise', label: 'Enterprise', displayLabel: 'Enterprise',
    tagline: 'Everything unlimited, built around your organisation',
    monthlyNgn: -1, scanLimit: -1, clientLimit: -1, automatedReminder: true,
    staffLimit: -1, taxAnalysis: 'advanced', invoiceBranding: true, supportPriority: true,
    selfServe: false, mostPopular: false,
  },
}

// Confirmed billing toggle math (not a placeholder — exact per ticket):
//   Quarterly = monthly x 3 x 0.90
//   Yearly    = monthly x 12 x 0.80
export const QUARTERLY_DISCOUNT_PCT = 10
export const YEARLY_DISCOUNT_PCT = 20

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'

// Returns the price actually due for that billing cycle (already applying
// the discount and cycle length) — NOT a monthly-equivalent figure.
export function priceForCycle(monthlyNgn: number, cycle: BillingCycle): number {
  if (monthlyNgn <= 0) return monthlyNgn // 0 (free) or -1 (custom) pass through unchanged
  if (cycle === 'quarterly') return Math.round(monthlyNgn * 3 * (1 - QUARTERLY_DISCOUNT_PCT / 100))
  if (cycle === 'yearly') return Math.round(monthlyNgn * 12 * (1 - YEARLY_DISCOUNT_PCT / 100))
  return monthlyNgn
}

// ── WhatsApp automation trial window (Free plan only) ────────────────────
// FLAGGED per the ticket's requirement 5: scanning (10x) and clients (5x)
// caps are treated as permanent, cumulative caps rather than time-based —
// they apply from day one and never "unlock" or "lock" on a timer, unlike
// WhatsApp automation. This is a reasonable default, NOT a confirmed
// product decision — flag back before relying on it.
export const WHATSAPP_TRIAL_DAYS = 14

// SAFETY: this feature-gate is new. Every org already on 'free' today was
// created before this shipped and has therefore already exceeded 14 days
// since signup — applying the rule retroactively would silently cut off
// WhatsApp access for every existing free-tier account (including active
// test/ambassador users) with no warning, exactly what we've been told not
// to do to existing users. So the 14-day rule only applies to orgs created
// on/after this cutoff; anything older is grandfathered with WhatsApp
// automation left active indefinitely. Flag back if this should change.
export const WHATSAPP_TRIAL_ENFORCEMENT_START = '2026-07-23T00:00:00.000Z'

export function canUseWhatsAppAutomation(rawPlan: string | null | undefined, orgCreatedAt: string | null | undefined): boolean {
  const plan = resolvePlan(rawPlan)
  if (plan !== 'free') return true
  if (!orgCreatedAt) return true
  if (orgCreatedAt < WHATSAPP_TRIAL_ENFORCEMENT_START) return true // grandfathered
  const trialEnd = new Date(orgCreatedAt).getTime() + WHATSAPP_TRIAL_DAYS * 24 * 60 * 60 * 1000
  return Date.now() < trialEnd
}

// ── Deprecated → current mapping ─────────────────────────────────────────
// Confirmed 2026-07-23: only one live org ("Big Dee", sme_starter) was on
// any deprecated name, with no real Paystack customer/subscription attached
// (a manual admin test override, not a paying subscriber) — approved for
// direct remap, already applied (bot/sql/step10-plan-rename-migration.sql).
// 'free_trial' is also now deprecated (retired this pass) — confirmed zero
// live orgs were ever on it before removing it as a distinct id.
export const DEPRECATED_PLAN_MAP: Record<string, PlanId> = {
  free_trial: 'free',
  solo: 'individual',       // dead/unused alternate scheme found in prior code
  pro: 'business_pro',      // dead/unused alternate scheme found in prior code
  family: 'individual',     // Family tier removed entirely — see FAMILY note above
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
  return getPlanConfig(rawPlan).taxAnalysis === 'advanced'
}

// Full Tax Hub page lock — Free's Tax Analysis is inactive, not just
// capped at basic periods.
export function canUseTaxHub(rawPlan: string | null | undefined): boolean {
  return getPlanConfig(rawPlan).taxAnalysis !== 'inactive'
}

export function canUseInvoiceBranding(rawPlan: string | null | undefined): boolean {
  return getPlanConfig(rawPlan).invoiceBranding
}

export function canUseAutomatedReminders(rawPlan: string | null | undefined): boolean {
  return getPlanConfig(rawPlan).automatedReminder
}

// Business (Starter) is explicitly, permanently blocked from inviting ANY
// team member (staffLimit 0) — this is the Business Pro upsell, not a
// headcount cap to raise later. Only Business Pro/Enterprise are unlimited.
export function staffLimitFor(rawPlan: string | null | undefined): number {
  return getPlanConfig(rawPlan).staffLimit
}

export function canInviteTeamMembers(rawPlan: string | null | undefined): boolean {
  return getPlanConfig(rawPlan).staffLimit !== 0
}

export function receiptLimitFor(rawPlan: string | null | undefined): number {
  return getPlanConfig(rawPlan).scanLimit
}

export function clientLimitFor(rawPlan: string | null | undefined): number {
  return getPlanConfig(rawPlan).clientLimit
}
