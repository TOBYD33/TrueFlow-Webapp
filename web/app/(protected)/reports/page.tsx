'use client'
// reports/page.tsx
// Analytics with charts, date range, and export buttons

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Receipt } from '@/types'
import { CategoryChart } from '@/components/CategoryChart'
import { SpendTrendChart } from '@/components/SpendTrendChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, CATEGORY_COLORS } from '@/lib/utils'
import { Download, FileSpreadsheet } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Range = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'this-year'

function getDateRange(range: Range): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  switch (range) {
    case 'this-month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end }
    case 'last-month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: s, end: e }
    }
    case 'last-3':
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end }
    case 'last-6':
      return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end }
    case 'this-year':
      return { start: new Date(now.getFullYear(), 0, 1), end }
  }
}

export default function ReportsPage() {
  const supabase = createClient()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [range, setRange] = useState<Range>('this-month')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) return
      setOrgId(member.org_id)
      const { data } = await supabase.from('receipts').select('*').eq('org_id', member.org_id).order('date', { ascending: false })
      setReceipts((data as Receipt[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const { start, end } = getDateRange(range)
  const filtered = useMemo(() =>
    receipts.filter(r => {
      const d = new Date(r.date)
      return d >= start && d <= end
    }),
    [receipts, range]
  )

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0)
  const taxTotal = filtered.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
  const avgPerReceipt = filtered.length ? total / filtered.length : 0

  const categoryTotals = Object.entries(
    filtered.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {})
  ).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total)

  const trendData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const m = d.getMonth(); const y = d.getFullYear()
    const t = receipts.filter(r => { const rd = new Date(r.date); return rd.getMonth() === m && rd.getFullYear() === y })
      .reduce((s, r) => s + Number(r.amount), 0)
    return { month: d.toLocaleString('default', { month: 'short' }), total: t }
  })

  const currentMonth = new Date().toISOString().slice(0, 7)

  function downloadReport(type: 'pdf' | 'excel') {
    const month = range === 'this-month' ? currentMonth :
      range === 'last-month' ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7) :
        ''
    const url = `/api/export/${type === 'pdf' ? 'pdf' : 'excel'}${month ? `?month=${month}` : ''}`
    window.open(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analyse your spending</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This month</SelectItem>
              <SelectItem value="last-month">Last month</SelectItem>
              <SelectItem value="last-3">Last 3 months</SelectItem>
              <SelectItem value="last-6">Last 6 months</SelectItem>
              <SelectItem value="this-year">This year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => downloadReport('pdf')}>
            <Download size={16} /> PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => downloadReport('excel')}>
            <FileSpreadsheet size={16} /> CSV
          </Button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Spent', value: formatCurrency(total) },
          { label: 'Receipts', value: String(filtered.length) },
          { label: 'Avg Per Receipt', value: formatCurrency(avgPerReceipt) },
          { label: 'Tax Tracked', value: formatCurrency(taxTotal) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium uppercase">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Spending by Category</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-60 flex items-center justify-center text-gray-400 text-sm">Loading…</div> :
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={categoryTotals} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {categoryTotals.map(entry => (
                      <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">6-Month Trend</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div> :
              <SpendTrendChart data={trendData} />
            }
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Receipts</th>
                <th className="px-4 py-3 text-right">% of Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categoryTotals.map(({ category, total: catTotal }) => (
                <tr key={category} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[category] ?? '#6b7280' }} />
                      {category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(catTotal)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{filtered.filter(r => r.category === category).length}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{total ? `${((catTotal / total) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
