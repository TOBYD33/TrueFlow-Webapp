// pricing/page.tsx
// Public pricing page — no login required

import Link from 'next/link'
import { Check } from 'lucide-react'

const PLANS = [
  {
    id: 'free',
    label: 'Free',
    ngn: '₦0',
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
    ngn: '₦5,000',
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
    ngn: '₦7,500',
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
    ngn: '₦12,000',
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
    ngn: '₦15,000',
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
    ngn: '₦25,000',
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="text-xl font-bold text-[#6C63FF]">TrueFlow</Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 font-medium">Sign in</Link>
          <Link
            href="/signup"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#6C63FF] text-white hover:bg-[#5A52E0] transition-colors"
          >
            Get started free
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, honest pricing</h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Start free. Upgrade when you grow. Cancel anytime.
          </p>
          <p className="text-sm text-gray-400 mt-2">All prices in Nigerian Naira. International pricing available on request.</p>
        </div>

        {/* Plan grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-[#6C63FF] bg-[#6C63FF] text-white shadow-xl shadow-purple-100 scale-[1.02]'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-bold uppercase tracking-widest text-purple-200 mb-2">Most popular</span>
              )}
              <h3 className={`text-xl font-bold mb-0.5 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                {plan.label}
              </h3>
              <p className={`text-sm mb-4 ${plan.highlight ? 'text-purple-200' : 'text-gray-500'}`}>
                {plan.description}
              </p>
              <div className="mb-6">
                <span className={`text-3xl font-bold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {plan.ngn}
                </span>
                <span className={`text-sm ml-1 ${plan.highlight ? 'text-purple-200' : 'text-gray-400'}`}>
                  {plan.period}
                </span>
              </div>
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      size={15}
                      className={`mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-[#00D4AA]' : 'text-emerald-500'}`}
                    />
                    <span className={plan.highlight ? 'text-purple-100' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.ctaHref}
                className={`block text-center text-sm font-semibold px-5 py-3 rounded-xl transition-colors ${
                  plan.highlight
                    ? 'bg-white text-[#6C63FF] hover:bg-purple-50'
                    : 'bg-[#6C63FF] text-white hover:bg-[#5A52E0]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Enterprise CTA */}
        <div className="rounded-2xl bg-gray-900 text-white px-8 py-10 text-center mb-20">
          <h2 className="text-2xl font-bold mb-2">Need more? Enterprise plan available.</h2>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto">
            Unlimited everything, custom integrations, dedicated support, white-label invoices, and custom pricing.
          </p>
          <a
            href="mailto:hello@gettrueflow.com"
            className="inline-block text-sm font-semibold px-6 py-3 rounded-xl bg-[#6C63FF] hover:bg-[#5A52E0] transition-colors"
          >
            Contact us
          </a>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-6">
            {FAQS.map(faq => (
              <div key={faq.q} className="border-b border-gray-100 pb-6">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} True Financial Portfolio Ltd · <a href="mailto:hello@gettrueflow.com" className="hover:text-gray-600">hello@gettrueflow.com</a></p>
      </footer>
    </div>
  )
}
