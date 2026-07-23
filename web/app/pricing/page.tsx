'use client'
// pricing/page.tsx
// Public pricing page — rebuilt for the new 2026-07 plan structure
// (free_trial, free, individual, business, business_pro, enterprise).
// Prices come from lib/plans.ts (single source of truth, shared with the
// in-app Settings → Subscription page and the Flutterwave checkout routes)
// so this page can never silently drift out of sync with what checkout
// actually charges.
//
// FLAGGED — not yet product-confirmed, see lib/plans.ts:
//   - ANNUAL_DISCOUNT_PCT (15%) is a placeholder from the ticket.
//   - Post-trial Free tier caps are placeholders (Feature 3).
// Multi-currency display (the old NG/KE/US switcher) was intentionally
// dropped in this rebuild — the new tier table only specifies NGN prices,
// and guessing KES/USD equivalents for the new tiers would be inventing
// numbers nobody has approved. Reintroduce once real FX/local pricing is
// decided.

import { useState } from 'react'
import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { PLAN_CONFIG, ANNUAL_DISCOUNT_PCT, TRIAL_DAYS, PlanId } from '@/lib/plans'

type BillingCycle = 'monthly' | 'annual'

const BRAND = {
  violet: '#6C63FF',
  mint: '#00D4AA',
  mintDeep: '#00A88A',
  black: '#0A0A0F',
  cloud: '#F5F5F7',
}

interface PricingCard {
  id: PlanId
  tagline: string
  features: string[]
  highlight: boolean
}

const CARDS: PricingCard[] = [
  {
    id: 'free',
    tagline: 'For individuals just getting started',
    features: ['10 receipts/month', '1 user', 'WhatsApp bot access', 'Basic expense tracking'],
    highlight: false,
  },
  {
    id: 'individual',
    tagline: 'Track your own money, effortlessly',
    features: ['Unlimited receipts', '1 user', 'Budgets & reminders', 'WhatsApp bot + web app', '+ optional Family add-on, +₦2,500/mo'],
    highlight: false,
  },
  {
    id: 'business',
    tagline: 'For businesses with a team, no headcount limits',
    features: ['Unlimited receipts, clients & staff', 'Client CRM & invoices', 'Basic Tax Hub', 'Accountant share link', 'WhatsApp bot for all staff'],
    highlight: true,
  },
  {
    id: 'business_pro',
    tagline: 'Deeper reporting and your own brand on every invoice',
    features: ['Everything in Business', 'Advanced Tax Hub (quarterly & yearly)', 'Custom invoice logo & branding', 'Priority support', 'No headcount limits'],
    highlight: false,
  },
]

function formatPrice(monthlyNgn: number, cycle: BillingCycle): string {
  if (monthlyNgn === 0) return '₦0'
  const monthly = cycle === 'annual' ? Math.round(monthlyNgn * (1 - ANNUAL_DISCOUNT_PCT / 100)) : monthlyNgn
  return `₦${monthly.toLocaleString('en-NG')}`
}

function BillingToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-gray-200 shadow-sm">
      {(['monthly', 'annual'] as BillingCycle[]).map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            cycle === c ? 'text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
          style={cycle === c ? { background: BRAND.violet } : undefined}
        >
          {c === 'monthly' ? 'Monthly' : `Annual (save ${ANNUAL_DISCOUNT_PCT}%)`}
        </button>
      ))}
    </div>
  )
}

const FAQS = [
  {
    q: 'Can I start for free?',
    a: `Yes. Every new signup gets ${TRIAL_DAYS} days of full access, no card required. After the trial, if you haven't upgraded, your account continues on the Free plan rather than losing access.`,
  },
  {
    q: 'How does the WhatsApp bot work?',
    a: 'Send a receipt photo to our WhatsApp number. The AI reads it, extracts the amount, vendor, and category, and logs it to your account automatically. It also works for client payment screenshots.',
  },
  {
    q: 'What is Smart Transfer Recognition?',
    a: "When a client sends you a payment proof (bank screenshot) on WhatsApp, forward it to TrueFlow. We read the screenshot, identify the sender, and update your books automatically. Works with all Nigerian banks.",
  },
  {
    q: 'Can I give my accountant access?',
    a: 'Yes. On Business and above, you can generate a read-only link for your accountant. They open it in any browser — no account needed.',
  },
  {
    q: 'Is Business really unlimited on team members?',
    a: "Yes. Business and Business Pro both have no cap on staff headcount. They're differentiated by invoice/client volume, Tax Hub depth, and invoice branding, not by how many people you can add.",
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
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: BRAND.violet }}>TrueFlow</Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-colors"
              style={{ background: BRAND.violet }}
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-14">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Start free. Upgrade when you grow. Cancel anytime.
          </p>
        </div>

        {/* Free Trial — prominent, separate from the plan grid */}
        <div
          className="rounded-2xl p-8 mb-10 text-center relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${BRAND.violet}, #4b3fd6)` }}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold uppercase tracking-wide mb-3">
            <Sparkles size={13} /> Free Trial
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Try everything free for {TRIAL_DAYS} days
          </h2>
          <p className="text-white/80 text-sm max-w-md mx-auto mb-5">
            Full feature access, no credit card required. When your trial period ends, your
            account simply continues on the Free plan — nothing is ever cut off without warning.
          </p>
          <Link
            href="/signup"
            className="inline-block text-sm font-semibold px-6 py-2.5 rounded-lg text-white transition-colors"
            style={{ background: BRAND.mint }}
          >
            Start Free Trial
          </Link>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-8">
          <BillingToggle cycle={cycle} onChange={setCycle} />
        </div>

        {/* Plan grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {CARDS.map(card => {
            const config = PLAN_CONFIG[card.id]
            return (
              <div
                key={card.id}
                className={`rounded-xl border flex flex-col p-6 transition-shadow ${
                  card.highlight
                    ? 'shadow-xl text-white'
                    : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
                }`}
                style={card.highlight ? { background: BRAND.black, borderColor: '#2a2a35' } : undefined}
              >
                {card.highlight && (
                  <span className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: BRAND.mint }}>
                    Most popular
                  </span>
                )}
                <h3 className={`text-lg font-bold mb-0.5 ${card.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {config.label}
                </h3>
                <p className={`text-sm mb-5 ${card.highlight ? 'text-gray-400' : 'text-gray-500'}`}>
                  {card.tagline}
                </p>
                <div className="mb-6">
                  <span className={`text-3xl font-bold ${card.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {formatPrice(config.monthlyNgn, cycle)}
                  </span>
                  {config.monthlyNgn > 0 && (
                    <span className={`text-sm ml-1 ${card.highlight ? 'text-gray-400' : 'text-gray-400'}`}>
                      /month{cycle === 'annual' ? ', billed yearly' : ''}
                    </span>
                  )}
                </div>
                <ul className="space-y-2 mb-8 flex-1">
                  {card.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check
                        size={15}
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: card.highlight ? BRAND.mint : BRAND.mintDeep }}
                      />
                      <span className={card.highlight ? 'text-gray-300' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`block text-center text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors ${
                    card.highlight ? 'text-white' : 'text-white'
                  }`}
                  style={{ background: card.highlight ? BRAND.mint : BRAND.black }}
                >
                  {config.monthlyNgn === 0 ? 'Get started free' : `Get ${config.label}`}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Enterprise CTA — never a checkout flow */}
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm px-8 py-10 text-center mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Need more? Enterprise plan available.</h2>
          <p className="text-gray-500 mb-6 max-w-lg mx-auto text-sm">
            Unlimited everything, custom integrations, dedicated support, white-label invoices,
            and pricing built around your organisation.
          </p>
          <a
            href="mailto:hello@gettrueflow.com?subject=Enterprise%20plan%20consultation"
            className="inline-block text-sm font-semibold px-6 py-2.5 rounded-lg text-white transition-colors"
            style={{ background: BRAND.violet }}
          >
            Talk to Us
          </a>
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
