'use client'
// pricing/page.tsx
// Public marketing pricing page. Reads from lib/plans.ts — the SAME
// single source of truth the in-app Settings → Subscription ("All Plans")
// page uses — so the two surfaces can never drift out of sync on prices,
// features, or tier names. Layout mirrors that page deliberately:
// Free/Individual/Business/Business Pro in one row, Enterprise alone below.
//
// No mention of "Family" anywhere on this page, intentionally — it's a
// standalone announcement ~2 months post-launch and should look like it
// was never part of this plan, not delayed.

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Sparkles } from 'lucide-react'
import {
  PLAN_CONFIG, PlanId, BillingCycle, priceForCycle,
  QUARTERLY_DISCOUNT_PCT, YEARLY_DISCOUNT_PCT, WHATSAPP_TRIAL_DAYS,
} from '@/lib/plans'

const BRAND = {
  violet: '#6C63FF',
  mint: '#00D4AA',
  mintDeep: '#00A88A',
  black: '#0A0A0F',
  cloud: '#F5F5F7',
}

function formatPrice(monthlyNgn: number, cycle: BillingCycle): string {
  if (monthlyNgn === -1) return 'Custom'
  if (monthlyNgn === 0) return '₦0'
  const price = priceForCycle(monthlyNgn, cycle)
  const suffix = cycle === 'quarterly' ? '/quarter' : cycle === 'yearly' ? '/year' : '/month'
  return `₦${price.toLocaleString('en-NG')}${suffix}`
}

// Split into amount + suffix, rendered as two separately-sized spans — a
// single unbroken string like "₦13,500/quarter" has no spaces for the
// browser to wrap at, so on a narrow card it silently overflows the
// border instead of wrapping.
function formatPriceParts(monthlyNgn: number, cycle: BillingCycle): { amount: string; suffix: string } {
  if (monthlyNgn === -1) return { amount: 'Custom', suffix: '' }
  if (monthlyNgn === 0) return { amount: '₦0', suffix: '' }
  const price = priceForCycle(monthlyNgn, cycle)
  const suffix = cycle === 'quarterly' ? '/quarter' : cycle === 'yearly' ? '/year' : '/month'
  return { amount: `₦${price.toLocaleString('en-NG')}`, suffix }
}

function planFeatureRows(id: PlanId): { label: string; value: string; ok: boolean }[] {
  const c = PLAN_CONFIG[id]
  return [
    {
      label: 'WhatsApp Automation',
      value: id === 'free' ? `Active (${WHATSAPP_TRIAL_DAYS}-day trial)` : 'Active',
      ok: true,
    },
    {
      label: 'Scanning (Business Card & Receipt)',
      value: c.scanLimit === -1 ? 'Active' : `${c.scanLimit}x`,
      ok: true,
    },
    {
      label: 'Clients',
      value: c.clientLimit === -1 ? 'Active' : c.clientLimit === 0 ? 'None' : `Up to ${c.clientLimit}`,
      ok: c.clientLimit !== 0,
    },
    { label: 'Automated Reminder', value: c.automatedReminder ? 'Active' : 'Inactive', ok: c.automatedReminder },
    { label: 'Team members', value: c.staffLimit === -1 ? 'Active' : 'Inactive', ok: c.staffLimit === -1 },
    {
      label: 'Tax Analysis',
      value: c.taxAnalysis === 'advanced' ? 'Advanced' : c.taxAnalysis === 'basic' ? 'Basic' : 'Inactive',
      ok: c.taxAnalysis !== 'inactive',
    },
    { label: 'Custom invoice (logo/branding)', value: c.invoiceBranding ? 'Active' : 'Inactive', ok: c.invoiceBranding },
    ...(c.supportPriority ? [{ label: 'Support Priority', value: 'Active', ok: true }] : []),
  ]
}

function BillingToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
  const options: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: `Quarterly (save ${QUARTERLY_DISCOUNT_PCT}%)` },
    { value: 'yearly', label: `Yearly (save ${YEARLY_DISCOUNT_PCT}%)` },
  ]
  return (
    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-gray-200 shadow-sm">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            cycle === o.value ? 'text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
          style={cycle === o.value ? { background: BRAND.violet } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PlanCard({ id, cycle }: { id: PlanId; cycle: BillingCycle }) {
  const c = PLAN_CONFIG[id]
  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 flex flex-col relative ${
        c.mostPopular ? 'border-[#6C63FF] shadow-xl bg-white' : 'bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow'
      }`}
    >
      {c.mostPopular && (
        <span
          className="absolute -top-3 left-6 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: BRAND.violet }}
        >
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-bold text-gray-900 mb-1 break-words">{c.displayLabel}</h3>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">{c.tagline}</p>
      <p className="text-gray-900 font-bold mb-7 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-3xl">{formatPriceParts(c.monthlyNgn, cycle).amount}</span>
        <span className="text-sm font-medium text-gray-400">{formatPriceParts(c.monthlyNgn, cycle).suffix}</span>
      </p>
      <div className="space-y-3.5 mb-8 flex-1">
        {planFeatureRows(id).map(row => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-gray-500">{row.label}</span>
            <span className={`font-medium flex items-center gap-1.5 shrink-0 ${row.ok ? 'text-gray-700' : 'text-gray-400'}`}>
              {row.ok ? <Check size={13} className="text-[#00A88A]" /> : <X size={13} className="text-gray-300" />}
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <Link
        href="/signup"
        className="block text-center text-sm font-semibold px-5 py-3 rounded-lg text-white transition-colors truncate"
        style={{ background: c.mostPopular ? BRAND.mint : BRAND.black }}
      >
        {c.monthlyNgn === 0 ? 'Get started free' : `Get ${c.label}`}
      </Link>
    </div>
  )
}

// Enterprise reads as prose, not a feature checklist — "everything,
// custom-priced" doesn't fit a row-by-row comparison the way the other
// four tiers do.
function EnterpriseCard() {
  return (
    <div className="rounded-2xl border border-[#6C63FF]/30 bg-white p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#6C63FF]/10 flex items-center justify-center shrink-0">
          <Sparkles size={18} style={{ color: BRAND.violet }} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Enterprise</h3>
          <p className="text-sm text-gray-500 mt-0.5">Custom pricing, built around your organisation</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">
        Unlimited receipts, clients, and team members, advanced tax reporting, custom invoice
        branding, and priority support — all scoped and priced around how your business actually
        works. No fixed tiers, no self-serve checkout, just a plan built for you.
      </p>
      <a
        href="mailto:hello@gettrueflow.com?subject=Enterprise%20plan%20consultation"
        className="inline-block text-sm font-semibold px-6 py-2.5 rounded-lg text-white transition-colors"
        style={{ background: BRAND.violet }}
      >
        Talk to Us
      </a>
    </div>
  )
}

const FAQS = [
  {
    q: 'Can I start for free?',
    a: `Yes. The Free plan is ₦0, no card required. WhatsApp automation stays active for the first ${WHATSAPP_TRIAL_DAYS} days; scanning and client limits apply from day one.`,
  },
  {
    q: 'How does the WhatsApp bot work?',
    a: 'Send a receipt photo to our WhatsApp number. The AI reads it, extracts the amount, vendor, and category, and logs it to your account automatically. It also works for client payment screenshots and business cards.',
  },
  {
    q: 'What is Smart Transfer Recognition?',
    a: "When a client sends you a payment proof (bank screenshot) on WhatsApp, forward it to TrueFlow. We read the screenshot, identify the sender, and update your books automatically. Works with all Nigerian banks.",
  },
  {
    q: 'Why can\'t Business (Starter) invite team members?',
    a: "Business (Starter) is built for solo-run businesses that want to look professional — custom invoices, unlimited clients, basic tax tracking. Adding a team is exactly what Business (Pro) unlocks.",
  },
  {
    q: 'What\'s the difference between Basic and Advanced Tax Analysis?',
    a: 'Basic (Individual, Business Starter) tracks and estimates tax month by month. Advanced (Business Pro, Enterprise) adds quarterly and yearly reporting.',
  },
  {
    q: 'How do I upgrade or cancel?',
    a: 'Manage your plan any time from Settings → Subscription inside the app, or email hello@gettrueflow.com.',
  },
]

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <div className="min-h-screen" style={{ background: BRAND.cloud }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-xl font-bold shrink-0" style={{ color: BRAND.violet }}>TrueFlow</Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg text-white transition-colors whitespace-nowrap"
              style={{ background: BRAND.violet }}
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Simple pricing for all your needs</h1>
          <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto px-2">
            Start for free, upgrade when you love it — no card required to try. All prices in NGN.
          </p>
        </div>

        <div className="flex justify-center mb-10 px-2">
          <BillingToggle cycle={cycle} onChange={setCycle} />
        </div>

        {/* Free / Individual / Business / Business Pro — one row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 mb-8">
          <PlanCard id="free" cycle={cycle} />
          <PlanCard id="individual" cycle={cycle} />
          <PlanCard id="business" cycle={cycle} />
          <PlanCard id="business_pro" cycle={cycle} />
        </div>

        {/* Enterprise — stands alone, prose card like Andrea Aid's style */}
        <div className="mb-16">
          <EnterpriseCard />
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
          <div className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {FAQS.map(faq => (
              <div key={faq.q} className="px-6 py-5">
                <h3 className="font-semibold text-gray-900 mb-1 text-sm">{faq.q}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white mt-16 py-8 text-center text-sm text-gray-400">
        <p>
          © {new Date().getFullYear()} True Financial Portfolio Ltd ·{' '}
          <a href="mailto:hello@gettrueflow.com" className="hover:text-gray-600 transition-colors">
            hello@gettrueflow.com
          </a>
        </p>
      </footer>
    </div>
  )
}
