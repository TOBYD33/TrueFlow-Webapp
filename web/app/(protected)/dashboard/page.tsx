'use client'
// dashboard/page.tsx
// Main dashboard — stat cards, charts, recent receipts, real-time updates

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Receipt, TaxCountry } from '@/types'
import { DEFAULT_INCOME_TAX_TYPE, COUNTRY_TO_CURRENCY, parseRateEstimate } from '@/lib/tax'
import { StatCard } from '@/components/StatCard'
import { CategoryChart } from '@/components/CategoryChart'
import { SpendTrendChart } from '@/components/SpendTrendChart'
import { ChannelBadge } from '@/components/ChannelBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, CATEGORY_COLORS } from '@/lib/utils'
import {
  DollarSign,
  Receipt as ReceiptIcon,
  MessageSquare,
  TrendingUp,
  Upload,
  TrendingDown,
  Calculator,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function DashboardPage() {
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [incomeThisMonth, setIncomeThisMonth] = useState(0)
  const [taxEstimate, setTaxEstimate] = useState<{ value: number; currency: string; approximate: boolean } | null>(null)
  const [recentChats, setRecentChats] = useState<{ id: string; phone_number: string; role: string; content: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Derived metrics
  const thisMonth = new Date()
  const monthReceipts = receipts.filter(r => {
    const d = new Date(r.date)
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear()
  })
  const totalSpent = monthReceipts.reduce((s, r) => s + Number(r.amount), 0)
  const taxTracked = monthReceipts.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
  const whatsappPct = monthReceipts.length
    ? Math.round((monthReceipts.filter(r => r.uploaded_via === 'whatsapp').length / monthReceipts.length) * 100)
    : 0

  // Category totals for chart
  const categoryTotals = Object.entries(
    monthReceipts.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {})
  )
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)

  // 6-month trend
  const trendData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const m = d.getMonth()
    const y = d.getFullYear()
    const total = receipts
      .filter(r => {
        const rd = new Date(r.date)
        return rd.getMonth() === m && rd.getFullYear() === y
      })
      .reduce((s, r) => s + Number(r.amount), 0)
    return {
      month: d.toLocaleString('default', { month: 'short' }),
      total,
    }
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .single()

      if (!member) { setLoading(false); return }
      setOrgId(member.org_id)

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

      const [{ data: receiptData }, { data: paymentData }, { data: org }] = await Promise.all([
        supabase.from('receipts').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false }),
        supabase.from('client_payments').select('amount').eq('org_id', member.org_id).gte('payment_date', monthStart).lte('payment_date', monthEnd),
        supabase.from('organizations').select('default_tax_country').eq('id', member.org_id).single(),
      ])

      setReceipts((receiptData as Receipt[]) ?? [])
      const income = ((paymentData ?? []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount), 0)
      setIncomeThisMonth(income)

      // Tax estimate — same bounded Layer 3 calculation as Tax Hub, for the
      // org's default country, surfaced here as a quick read-only preview.
      const taxCountry = (org?.default_tax_country as TaxCountry) || 'Nigeria'
      const taxType = DEFAULT_INCOME_TAX_TYPE[taxCountry]
      const { data: rateRow } = await supabase
        .from('tax_rate_reference')
        .select('rate')
        .eq('country', taxCountry)
        .eq('tax_type', taxType)
        .maybeSingle()

      if (rateRow) {
        const parsed = parseRateEstimate(rateRow.rate)
        if (parsed) {
          setTaxEstimate({ value: income * parsed.pct, currency: COUNTRY_TO_CURRENCY[taxCountry], approximate: parsed.approximate })
        }
      }

      // Load recent WhatsApp conversations for this org
      const { data: sessions } = await supabase
        .from('whatsapp_sessions')
        .select('phone_number')
        .eq('org_id', member.org_id)
        .order('last_active_at', { ascending: false })
        .limit(10)

      const phones = (sessions ?? []).map((s: { phone_number: string }) => s.phone_number)

      if (phones.length > 0) {
        const { data: chats } = await supabase
          .from('whatsapp_conversations')
          .select('id, phone_number, role, content, created_at')
          .in('phone_number', phones)
          .order('created_at', { ascending: false })
          .limit(8)
        setRecentChats((chats ?? []) as typeof recentChats)
      }

      setLoading(false)
    }
    load()
  }, [])

  // Real-time: new receipt scanned via WhatsApp appears instantly
  useEffect(() => {
    if (!orgId) return

    const channel = supabase
      .channel(`receipts:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'receipts', filter: `org_id=eq.${orgId}` },
        payload => {
          const receipt = payload.new as Receipt
          setReceipts(prev => [receipt, ...prev])
          toast.success(`New receipt via WhatsApp — ${formatCurrency(receipt.amount)} ${receipt.category}`)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orgId])

  const recentReceipts = receipts.slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleString('en-NG', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Link href="/receipts">
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Upload size={16} /> Upload Receipt
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Money Out (this month)"
          value={formatCurrency(totalSpent)}
          sub={`${monthReceipts.length} receipts`}
          icon={TrendingDown}
          color="orange"
        />
        <StatCard
          label="Money In (this month)"
          value={formatCurrency(incomeThisMonth)}
          sub="from clients"
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="Via WhatsApp"
          value={`${whatsappPct}%`}
          sub="of receipts"
          icon={MessageSquare}
          color="purple"
        />
        <StatCard
          label="Tax on Expenses"
          value={formatCurrency(taxTracked)}
          sub="itemized on receipts"
          icon={DollarSign}
          color="blue"
        />
        <Link href="/tax">
          <StatCard
            label="Tax Estimate (this month)"
            value={taxEstimate ? formatCurrency(taxEstimate.value, taxEstimate.currency) : '—'}
            sub={taxEstimate ? (taxEstimate.approximate ? 'Approx. — view in Tax Hub' : 'View in Tax Hub') : 'Set up in Tax Hub'}
            icon={Calculator}
            color="indigo"
          />
        </Link>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-60 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
            ) : (
              <CategoryChart data={categoryTotals} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">6-Month Spend Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
            ) : (
              <SpendTrendChart data={trendData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp activity feed */}
      {(recentChats.length > 0 || !loading) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare size={16} className="text-[#25D366]" />
              WhatsApp Activity
            </CardTitle>
            <Link href="/whatsapp" className="text-sm text-emerald-600 hover:underline">
              View all chats
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentChats.length === 0 ? (
              <p className="px-5 py-5 text-sm text-gray-400">No WhatsApp messages yet. Send a message to your bot to get started.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentChats.map(msg => (
                  <div key={msg.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${msg.role === 'user' ? 'bg-[#25D366] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {msg.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-500">{msg.phone_number}</span>
                        <span className="text-xs text-gray-300">{new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent receipts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Receipts</CardTitle>
          <Link href="/receipts" className="text-sm text-emerald-600 hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : recentReceipts.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              No receipts yet. Scan one on WhatsApp or upload below.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Vendor</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Channel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentReceipts.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.vendor_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ background: CATEGORY_COLORS[r.category] ?? '#6b7280' }}
                        />
                        {r.category}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.amount, r.currency)}</td>
                      <td className="px-4 py-3">
                        <ChannelBadge channel={r.uploaded_via} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
