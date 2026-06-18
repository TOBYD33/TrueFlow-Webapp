'use client'
// invoices/[id]/page.tsx
// Invoice detail — preview layout, mark paid, download PDF, status management

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Invoice } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle, Download, Send } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-yellow-100 text-yellow-700',
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: member } = await supabase
          .from('org_members')
          .select('org_id, organizations(name)')
          .eq('user_id', user.id)
          .single()
        if (!member) return
        const org = (member as unknown as { org_id: string; organizations: { name: string } | null })
        setOrgName(org.organizations?.name ?? '')

        const { data } = await supabase.from('invoices').select('*, clients(name, email)').eq('id', invoiceId).single()
        setInvoice(data as unknown as Invoice)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [invoiceId])

  async function updateStatus(status: 'paid' | 'sent' | 'cancelled') {
    setUpdating(true)
    const update: Record<string, unknown> = { status }
    if (status === 'paid') update.paid_at = new Date().toISOString()
    const { error } = await supabase.from('invoices').update(update).eq('id', invoiceId)
    setUpdating(false)
    if (error) { toast.error(error.message); return }
    setInvoice(prev => prev ? { ...prev, status, paid_at: status === 'paid' ? new Date().toISOString() : prev.paid_at } : prev)
    toast.success(`Invoice marked as ${status}`)
  }

  function printInvoice() {
    window.print()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!invoice) return <div className="p-8 text-center text-gray-400">Invoice not found</div>

  const clientName = (invoice.clients as unknown as { name: string } | null)?.name ?? invoice.client_name ?? '—'
  const clientEmail = (invoice.clients as unknown as { email: string | null } | null)?.email ?? invoice.client_email ?? ''
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center gap-3 print:hidden">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <Badge variant="outline" className={STATUS_STYLES[invoice.status] ?? ''}>{invoice.status}</Badge>
        <div className="flex-1" />
        {invoice.status === 'draft' && (
          <Button variant="outline" className="gap-2" onClick={() => updateStatus('sent')} disabled={updating}>
            <Send size={15} /> Mark as Sent
          </Button>
        )}
        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => updateStatus('paid')} disabled={updating}>
            <CheckCircle size={15} /> Mark as Paid
          </Button>
        )}
        <Button variant="outline" className="gap-2" onClick={printInvoice}>
          <Download size={15} /> Print / PDF
        </Button>
      </div>

      {/* Invoice preview — looks like a real invoice */}
      <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{orgName}</h2>
            <p className="text-sm text-gray-400 mt-1">hello@gettrueflow.com</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-emerald-600">INVOICE</p>
            <p className="text-sm font-mono text-gray-500 mt-1">{invoice.invoice_number ?? '—'}</p>
          </div>
        </div>

        {/* Bill to + dates */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Bill To</p>
            <p className="font-semibold text-gray-900">{clientName}</p>
            {clientEmail && <p className="text-sm text-gray-500">{clientEmail}</p>}
          </div>
          <div className="text-right space-y-1">
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-gray-400">Issue Date</span>
              <span className="font-medium">{formatDate(invoice.issue_date)}</span>
            </div>
            {invoice.due_date && (
              <div className="flex justify-end gap-4 text-sm">
                <span className="text-gray-400">Due Date</span>
                <span className="font-medium">{formatDate(invoice.due_date)}</span>
              </div>
            )}
            {invoice.paid_at && (
              <div className="flex justify-end gap-4 text-sm">
                <span className="text-gray-400">Paid On</span>
                <span className="font-medium text-emerald-600">{formatDate(invoice.paid_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="pb-2 text-left font-semibold text-gray-700">Description</th>
              <th className="pb-2 text-right font-semibold text-gray-700 w-16">Qty</th>
              <th className="pb-2 text-right font-semibold text-gray-700 w-28">Unit Price</th>
              <th className="pb-2 text-right font-semibold text-gray-700 w-28">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-3 text-gray-700">{item.description}</td>
                <td className="py-3 text-right text-gray-500">{item.quantity}</td>
                <td className="py-3 text-right text-gray-500">{formatCurrency(item.unit_price, invoice.currency)}</td>
                <td className="py-3 text-right font-medium">{formatCurrency(item.total, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-60 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.tax_rate > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tax ({invoice.tax_rate}%)</span>
                <span>{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span>
              <span className="text-emerald-600">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="border-t pt-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Notes</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t text-center text-xs text-gray-400">
          Generated by TrueFlow · gettrueflow.com
        </div>
      </div>
    </div>
  )
}
