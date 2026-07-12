'use client'
// income/page.tsx
// All client payments (Money In) across all clients — searchable, filterable

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { ClientPayment } from '@/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, TrendingUp } from 'lucide-react'
import { usePageTools } from '@/components/shared/PageTools'

type PaymentWithClient = ClientPayment & {
  clients: { name: string } | null
  projects: { name: string } | null
}

const TYPE_COLORS: Record<string, string> = {
  deposit: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  part_payment: 'bg-amber-100 text-amber-700',
  full_payment: 'bg-[#00D4AA]/10 text-[#00A88A]',
  retainer: 'bg-[#6C63FF]/10 text-[#6C63FF]',
}

export default function IncomePage() {
  const supabase = createClient()

  const { orgId } = useViewingContext()
  const [payments, setPayments] = useState<PaymentWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const { data } = await supabase
        .from('client_payments')
        .select('*, clients(name), projects(name)')
        .eq('org_id', orgId)
        .order('payment_date', { ascending: false })

      setPayments((data as unknown as PaymentWithClient[]) ?? [])
      setLoading(false)
    }
    load()
  }, [orgId])

  const { query: headerQuery } = usePageTools({
    searchable: true,
    exportName: 'income',
    exportRows: () =>
      filtered.map(p => ({
        date: p.payment_date,
        client: p.clients?.name ?? '',
        project: p.projects?.name ?? '',
        type: p.payment_type,
        reference: p.payment_reference ?? '',
        amount: p.amount,
        currency: p.currency,
      })),
  })

  const effectiveSearch = search || headerQuery
  const filtered = payments.filter(p => {
    const matchesType = typeFilter === 'all' || p.payment_type === typeFilter
    const clientName = p.clients?.name ?? ''
    const matchesSearch = clientName.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
      (p.payment_reference ?? '').toLowerCase().includes(effectiveSearch.toLowerCase())
    return matchesType && matchesSearch
  })

  const now = new Date()
  const thisMonthPayments = payments.filter(p => {
    const d = new Date(p.payment_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const incomeThisMonth = thisMonthPayments.reduce((s, p) => s + Number(p.amount), 0)
  const totalAllTime = payments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Income</h1>
        <p className="text-sm text-gray-500 mt-0.5">All client payments — Money In</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">This Month</p>
            <p className="text-2xl font-bold text-[#00A88A] mt-1">{formatCurrency(incomeThisMonth)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{thisMonthPayments.length} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">All Time</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalAllTime)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{payments.length} total payments</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-1 col-span-2">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp size={24} className="text-[#00D4AA]" />
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Avg per payment</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(payments.length ? totalAllTime / payments.length : 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by client or reference…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => v && setTypeFilter(v)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="part_payment">Part payment</SelectItem>
                <SelectItem value="full_payment">Full payment</SelectItem>
                <SelectItem value="retainer">Retainer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {search || typeFilter !== 'all' ? 'No payments match your filters' : 'No payments yet — record a payment from a client page'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Date</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Project</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Reference</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <p>{p.clients?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400 sm:hidden">{formatDate(p.payment_date)}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{p.projects?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={TYPE_COLORS[p.payment_type] ?? ''}>
                          {p.payment_type.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden lg:table-cell">{p.payment_reference ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#00A88A]">{formatCurrency(p.amount, p.currency)}</td>
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
