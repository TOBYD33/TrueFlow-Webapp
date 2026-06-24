'use client'
// settings/subscription/page.tsx
// Current plan, usage stats, and plan comparison grid

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'

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
  const [plan, setPlan] = useState('free')
  const [receiptCount, setReceiptCount] = useState(0)
  const [clientCount, setClientCount] = useState(0)
  const [staffCount, setStaffCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: member } = await supabase
          .from('org_members').select('org_id').eq('user_id', user.id).single()
        if (!member) return

        const [{ data: org }, { count: rc }, { count: cc }, { count: sc }] = await Promise.all([
          supabase.from('organizations').select('plan').eq('id', member.org_id).single(),
          supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', member.org_id),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('org_id', member.org_id),
          supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', member.org_id),
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
  }, [])

  const currentPlan = PLANS.find(p => p.id === plan) ?? PLANS[0]

  return (
    <div className="space-y-6">
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
                {!isCurrent && p.id !== 'enterprise' && (
                  <a
                    href="https://gettrueflow.com/pricing"
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full text-center text-xs font-semibold h-8 leading-8 rounded-md bg-[#6C63FF] hover:bg-[#5A52E0] text-white transition-colors"
                  >
                    Upgrade
                  </a>
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
                  <p className="text-xs text-emerald-600 font-medium text-center">Current plan</p>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Payments are processed via Paystack. To upgrade, contact <a href="mailto:hello@gettrueflow.com" className="text-emerald-600 hover:underline">hello@gettrueflow.com</a> or visit <a href="https://gettrueflow.com/pricing" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">gettrueflow.com/pricing</a>.
        </p>
      </div>
    </div>
  )
}
