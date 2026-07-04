'use client'
// settings/subscription/page.tsx
// Current plan, usage stats, and plan comparison grid

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Heart } from 'lucide-react'

function AndreaSection({ orgId }: { orgId: string | null }) {
  const supabase = createClient()
  const [orgTotal, setOrgTotal] = useState<number>(0)
  const [communityTotal, setCommunityTotal] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const [{ data: rows }, communityRes] = await Promise.all([
        supabase.from('andrea_contributions').select('amount').eq('org_id', orgId),
        fetch('/api/andrea/total').then(r => r.json()).catch(() => ({ total: null })),
      ])
      const t = (rows ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
      setOrgTotal(t)
      if (communityRes?.total != null) setCommunityTotal(Number(communityRes.total))
      setLoaded(true)
    }
    load()
  }, [orgId])

  const fmt = (n: number) =>
    `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Card className="border-[#00D4AA]/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#00D4AA]/15 flex items-center justify-center shrink-0">
            <Heart size={16} className="text-[#00D4AA] fill-[#00D4AA]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Andrea Aid Partnership</p>
            <p className="text-xs text-gray-500 mt-0.5">
              2% of every TrueFlow subscription funds life-saving medical treatments in Nigeria
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 p-4 rounded-xl bg-[#00D4AA]/5 border border-[#00D4AA]/20">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Your contribution</p>
            <p className="text-xl font-bold" style={{ color: '#00D4AA' }}>
              {loaded ? fmt(orgTotal) : '—'}
            </p>
            <p className="text-xs text-gray-400">lifetime total</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">TrueFlow community</p>
            <p className="text-xl font-bold" style={{ color: '#00D4AA' }}>
              {communityTotal != null ? fmt(communityTotal) : 'Growing every month'}
            </p>
            <p className="text-xs text-gray-400">contributed in total</p>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Your contribution comes from TrueFlow&apos;s own revenue — you are never charged extra.
          Every naira goes directly to verified patient care at partnered Nigerian hospitals.
        </p>

        <div className="flex gap-3">
          <a
            href="https://andreaaid.com/cases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-2 rounded-lg text-white transition-colors"
            style={{ backgroundColor: '#00D4AA' }}
          >
            Browse patient cases →
          </a>
          <a
            href="https://andreaaid.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Learn about Andrea
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

const PLANS = [
  { id: 'free',        label: 'Free',        ngn: '₦0',          receipts: '10/mo',     clients: 0,  staff: 1  },
  { id: 'individual',  label: 'Individual',   ngn: '₦2,500/mo',   receipts: 'Unlimited', clients: 0,  staff: 1  },
  { id: 'family',      label: 'Family',       ngn: '₦5,000/mo',   receipts: 'Unlimited', clients: 0,  staff: 6  },
  { id: 'freelancer',  label: 'Freelancer',   ngn: '₦5,000/mo',   receipts: 'Unlimited', clients: 10, staff: 1  },
  { id: 'sme_starter', label: 'SME Starter',  ngn: '₦7,500/mo',   receipts: 'Unlimited', clients: 10, staff: 5  },
  { id: 'agency',      label: 'Agency',       ngn: '₦12,000/mo',  receipts: 'Unlimited', clients: 50, staff: 3  },
  { id: 'sme_pro',     label: 'SME Pro',      ngn: '₦15,000/mo',  receipts: 'Unlimited', clients: 50, staff: 15 },
  { id: 'studio',      label: 'Studio',       ngn: '₦25,000/mo',  receipts: 'Unlimited', clients: -1, staff: 10 },
  { id: 'enterprise',  label: 'Enterprise',   ngn: 'Custom',       receipts: 'Unlimited', clients: -1, staff: -1 },
]

function formatLimit(n: number) {
  if (n === -1) return 'Unlimited'
  if (n === 0) return 'None'
  return String(n)
}

export default function SubscriptionPage() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const [plan, setPlan] = useState('free')
  const [receiptCount, setReceiptCount] = useState(0)
  const [clientCount, setClientCount] = useState(0)
  const [staffCount, setStaffCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      try {
        const [{ data: org }, { count: rc }, { count: cc }, { count: sc }] = await Promise.all([
          supabase.from('organizations').select('plan').eq('id', orgId).single(),
          supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
        ])

        if (org?.plan) setPlan(org.plan)
        setReceiptCount(rc ?? 0)
        setClientCount(cc ?? 0)
        setStaffCount(sc ?? 0)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [orgId])

  const currentPlan = PLANS.find(p => p.id === plan) ?? PLANS[0]
  const [upgrading, setUpgrading] = useState<string | null>(null)

  async function handleUpgrade(planId: string) {
    setUpgrading(planId)
    try {
      const res = await fetch('/api/flutterwave/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }),
      })
      const json = await res.json()
      if (!res.ok || !json.link) {
        alert(json.error ?? 'Could not start checkout. Please try again.')
        return
      }
      window.location.href = json.link
    } catch {
      alert('Could not connect to payment provider. Please try again.')
    } finally {
      setUpgrading(null)
    }
  }

  // Show success banner after returning from Flutterwave
  // Flutterwave redirects back with ?status=successful&transaction_id=xxx&tx_ref=xxx
  const [showSuccess, setShowSuccess] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const upgraded = params.get('upgraded') === '1'
      const flwStatus = params.get('status')
      if (upgraded && flwStatus !== 'cancelled') {
        setShowSuccess(true)
        window.history.replaceState({}, '', '/settings/subscription')
        // Reload plan after a short delay to pick up webhook update
        setTimeout(() => window.location.reload(), 4000)
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      {showSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Check size={16} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">Payment received! Your plan will activate within a few minutes.</p>
        </div>
      )}

      {/* Current plan card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Current plan</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{currentPlan.label}</p>
              <p className="text-lg text-emerald-600 font-semibold mt-0.5">{currentPlan.ngn}</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs uppercase tracking-wide">
              {loading ? '…' : plan}
            </Badge>
          </div>

          {/* Usage stats */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{receiptCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Receipts scanned</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{clientCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Clients</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{staffCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Team members</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">All Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PLANS.map(p => {
            const isCurrent = plan === p.id
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${isCurrent ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="font-semibold text-sm text-gray-900">{p.label}</p>
                  {isCurrent && <Check size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />}
                </div>
                <p className="text-emerald-600 font-bold text-base mb-2">{p.ngn}</p>
                <div className="space-y-1 mb-3">
                  <p className="text-xs text-gray-500">Receipts: <span className="font-medium text-gray-700">{p.receipts}</span></p>
                  <p className="text-xs text-gray-500">Clients: <span className="font-medium text-gray-700">{formatLimit(p.clients)}</span></p>
                  <p className="text-xs text-gray-500">Staff: <span className="font-medium text-gray-700">{formatLimit(p.staff)}</span></p>
                </div>
                {!isCurrent && p.id !== 'free' && p.id !== 'enterprise' && (
                  <button
                    onClick={() => handleUpgrade(p.id)}
                    disabled={upgrading === p.id}
                    className="block w-full text-center text-xs font-semibold h-8 leading-8 rounded-md bg-[#6C63FF] hover:bg-[#5A52E0] text-white transition-colors disabled:opacity-60"
                  >
                    {upgrading === p.id ? 'Redirecting…' : 'Upgrade'}
                  </button>
                )}
                {!isCurrent && p.id === 'enterprise' && (
                  <a
                    href="mailto:hello@gettrueflow.com"
                    className="block w-full text-center text-xs font-semibold h-8 leading-8 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Contact us
                  </a>
                )}
                {isCurrent && (
                  <p className="text-xs text-emerald-600 font-medium text-center">✓ Current plan</p>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Payments processed securely via Flutterwave. Cancel any time from your account settings.
        </p>
      </div>

      {/* Andrea Aid partnership */}
      <AndreaSection orgId={orgId} />
    </div>
  )
}
