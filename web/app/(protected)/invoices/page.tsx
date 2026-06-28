'use client'
// invoices/page.tsx
// Invoice list with status badges and New Invoice button

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Invoice } from '@/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, FileText } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-yellow-100 text-yellow-700',
}

type InvoiceWithClient = Invoice & { clients: { name: string } | null }

export default function InvoicesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) { setLoading(false); return }

      const { data } = await supabase
        .from('invoices')
        .select('*, clients(name)')
        .eq('org_id', member.org_id)
        .order('created_at', { ascending: false })

      setInvoices((data as unknown as InvoiceWithClient[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase()
    return (
      (inv.invoice_number ?? '').toLowerCase().includes(q) ||
      (inv.clients?.name ?? inv.client_name ?? '').toLowerCase().includes(q)
    )
  })

  const totalDraft = invoices.filter(i => i.status === 'draft').length
  const totalSent = invoices.filter(i => i.status === 'sent').length
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">{invoices.length} total · {totalDraft} draft · {totalSent} sent</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0" onClick={() => router.push('/invoices/new')}>
          <Plus size={16} /> New Invoice
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Draft', value: String(totalDraft), color: 'text-gray-700' },
          { label: 'Sent / Awaiting', value: String(totalSent), color: 'text-blue-600' },
          { label: 'Total Paid', value: formatCurrency(totalPaid), color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by invoice number or client…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <FileText size={32} className="text-gray-300" />
              {search ? 'No invoices match your search' : 'No invoices yet — create your first one'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Invoice #</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Issue Date</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Due Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(inv => (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/invoices/${inv.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">
                        {inv.invoice_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {inv.clients?.name ?? inv.client_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_STYLES[inv.status] ?? ''}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{formatDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                        {inv.due_date ? formatDate(inv.due_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(inv.total_amount, inv.currency)}</td>
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
