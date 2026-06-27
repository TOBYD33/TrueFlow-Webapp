'use client'
// pricing/page.tsx
// Public pricing page with country/currency switcher.
// Switching country updates all prices to that currency.

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'

// ── Currency config ───────────────────────────────────────────────────────────

type CountryKey = 'NG' | 'KE' | 'US'

const COUNTRIES: { key: CountryKey; label: string; flag: string; currency: string; symbol: string }[] = [
  { key: 'NG', label: 'Nigeria',  flag: '🇳🇬', currency: 'NGN', symbol: '₦' },
  { key: 'KE', label: 'Kenya',    flag: '🇰🇪', currency: 'KES', symbol: 'KES ' },
  { key: 'US', label: 'USA',      flag: '🇺🇸', currency: 'USD', symbol: '$' },
]

// Prices per plan per country
const PRICES: Record<string, Record<CountryKey, string>> = {
  free:        { NG: '₦0',       KE: 'KES 0',     US: '$0' },
  freelancer:  { NG: '₦5,000',   KE: 'KES 1,300', US: '$9.99' },
  sme_starter: { NG: '₦7,500',   KE: 'KES 2,500', US: '$19' },
  agency:      { NG: '₦12,000',  KE: 'KES 3,200', US: '$24.99' },
  sme_pro:     { NG: '₦15,000',  KE: 'KES 5,000', US: '$39' },
  studio:      { NG: '₦25,000',  KE: 'KES 6,500', US: '$49.99' },
}

// ── Plans ─────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    label: 'Free',
    period: 'forever',
    description: 'For individuals just getting started',
    features: ['10 receipts/month', '1 user', 'WhatsApp bot access', 'Basic expense tracking'],
    cta: 'Get started free',
    ctaHref: '/signup',
    highlight: false,
  },
  {
    id: 'freelancer',
    label: 'Freelancer',
    period: '/month',
    description: 'For solo freelancers tracking clients and income',
    features: ['Unlimited receipts', '1 user', 'Up to 10 clients', 'Client CRM & invoices', 'WhatsApp bot + web app', 'Accountant share link'],
    cta: 'Start free trial',
    ctaHref: '/signup',
    highlight: true,
  },
  {
    id: 'sme_starter',
    label: 'SME Starter',
    period: '/month',
    description: 'For small businesses with a team',
    features: ['Unlimited receipts', 'Up to 5 staff', 'Up to 10 clients', 'Client CRM & invoices', 'WhatsApp bot for all staff', 'Accountant portal', 'Expense reports & exports'],
    cta: 'Get SME Starter',
    ctaHref: '/signup',
    highlight: false,
  },
  {
    id: 'agency',
    label: 'Agency',
    period: '/month',
    description: 'For agencies managing many clients',
    features: ['Unlimited receipts', 'Up to 3 staff', 'Up to 50 clients', 'Invoice generation & PDF', 'Client CRM with projects', 'WhatsApp bot', 'Advanced reports'],
    cta: 'Get Agency',
    ctaHref: '/signup',
    highlight: false,
  },
  {
    id: 'sme_pro',
    label: 'SME Pro',
    period: '/month',
    description: 'For growing businesses needing more',
    features: ['Unlimited receipts', 'Up to 15 staff', 'Up to 50 clients', 'All SME Starter features', 'Advanced analytics', 'Priority support'],
    cta: 'Get SME Pro',
    ctaHref: '/signup',
    highlight: false,
  },
  {
    id: 'studio',
    label: 'Studio',
    period: '/month',
    description: 'For large studios and enterprises',
    features: ['Unlimited receipts', 'Up to 10 staff', 'Unlimited clients', 'White-label invoices', 'All Pro features', 'Dedicated onboarding'],
    cta: 'Get Studio',
    ctaHref: '/signup',
    highlight: false,
  },
]

const FAQS = [
  {
    q: 'Can I start for free?',
    a: 'Yes. The Free plan is free forever — no credit card needed. You get 10 receipts per month and full WhatsApp bot access.',
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
    a: 'Yes. On SME Starter and above, you can generate a read-only link for your accountant. They open it in any browser — no account needed.',
  },
  {
    q: 'What currencies are supported?',
    a: 'We support NGN, USD, GBP, EUR, KES, GHS, ZAR, and more. Nigerian Naira is the default.',
  },
  {
    q: 'How do I upgrade or cancel?',
    a: 'Email hello@gettrueflow.com or manage your plan from Settings → Subscription inside the app.',
  },
]

// ── Country switcher dropdown ─────────────────────────────────────────────────

function CountrySwitcher({ country, onChange }: { country: CountryKey; onChange: (c: CountryKey) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = COUNTRIES.find(c => c.key === country)!

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-gray-700"
      >
        <span className="text-xl leading-none">{current.flag}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {COUNTRIES.map(c => (
            <button
              key={c.key}
              onClick={() => { onChange(c.key); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-2xl leading-none">{c.flag}</span>
              <span className="text-sm font-medium text-gray-700 flex-1">{c.label}</span>
              {c.key === country && (
                <Check size={14} className="text-emerald-500" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [country, setCountry] = useState<CountryKey>('NG')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-emerald-500">TrueFlow</Link>
          <div className="flex items-center gap-3">
            <CountrySwitcher country={country} onChange={setCountry} />
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-14">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Start free. Upgrade when you grow. Cancel anytime.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Showing prices in {COUNTRIES.find(c => c.key === country)?.currency}.
          </p>
        </div>

        {/* Plan grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className={`rounded-xl border flex flex-col p-6 transition-shadow ${
                plan.highlight
                  ? 'bg-gray-900 border-gray-700 shadow-xl text-white'
                  : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">
                  Most popular
                </span>
              )}
              <h3 className={`text-lg font-bold mb-0.5 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                {plan.label}
              </h3>
              <p className={`text-sm mb-5 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>
                {plan.description}
              </p>
              <div className="mb-6">
                <span className={`text-3xl font-bold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {PRICES[plan.id][country]}
                </span>
                <span className={`text-sm ml-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-400'}`}>
                  {plan.period}
                </span>
              </div>
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      size={15}
                      className={`mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500'}`}
                    />
                    <span className={plan.highlight ? 'text-gray-300' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.ctaHref}
                className={`block text-center text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors ${
                  plan.highlight
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Enterprise CTA */}
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm px-8 py-10 text-center mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Need more? Enterprise plan available.</h2>
          <p className="text-gray-500 mb-6 max-w-lg mx-auto text-sm">
            Unlimited everything, custom integrations, dedicated support, white-label invoices, and custom pricing.
          </p>
          <a
            href="mailto:hello@gettrueflow.com"
            className="inline-block text-sm font-semibold px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            Contact us
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
