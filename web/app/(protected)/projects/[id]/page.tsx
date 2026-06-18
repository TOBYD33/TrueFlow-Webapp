'use client'
// projects/[id]/page.tsx
// Project detail — financials, payment history, status updates, linked receipts

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Project, Client, ClientPayment, Receipt } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChannelBadge } from '@/components/ChannelBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Plus, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
}

const STATUS_FLOW = ['in_progress', 'delivered', 'completed'] as const

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [payments, setPayments] = useState<ClientPayment[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_type: 'part_payment',
    payment_date: new Date().toISOString().split('T')[0],
    payment_reference: '',
    notes: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) return
      setOrgId(member.org_id)

      const [{ data: p }, { data: pay }, { data: rec }] = await Promise.all([
        supabase.from('projects').select('*, clients(*)').eq('id', projectId).single(),
        supabase.from('client_payments').select('*').eq('project_id', projectId).order('payment_date', { ascending: false }),
        supabase.from('receipts').select('*').eq('project_id', projectId).order('date', { ascending: false }),
      ])

      if (p) {
        const proj = p as unknown as Project & { clients: Client }
        setProject(proj)
        setClient(proj.clients ?? null)
      }
      setPayments((pay as ClientPayment[]) ?? [])
      setReceipts((rec as Receipt[]) ?? [])
      setLoading(false)
    }
    load()
  }, [projectId])

  async function updateStatus(newStatus: string) {
    if (!project) return
    setSaving(true)
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'delivered') update.delivered_at = new Date().toISOString()
    if (newStatus === 'completed') update.completed_at = new Date().toISOString()
    const { error } = await supabase.from('projects').update(update).eq('id', projectId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setProject(prev => prev ? { ...prev, status: newStatus as Project['status'] } : prev)
    toast.success(`Status updated to ${newStatus.replace('_', ' ')}`)
  }

  async function addPayment() {
    if (!orgId || !project || !paymentForm.amount) return
    setSaving(true)
    const amount = Number(paymentForm.amount)
    const { data, error } = await supabase.from('client_payments').insert({
      org_id: orgId,
      client_id: project.client_id,
      project_id: projectId,
      amount,
      payment_type: paymentForm.payment_type,
      payment_date: paymentForm.payment_date,
      payment_reference: paymentForm.payment_reference || null,
      notes: paymentForm.notes || null,
    }).select().single()

    if (!error) {
      // Update project amount_received
      const newReceived = Number(project.amount_received) + amount
      await supabase.from('projects').update({ amount_received: newReceived }).eq('id', projectId)
      setProject(prev => prev ? { ...prev, amount_received: newReceived } : prev)

      // Update client total_earned
      if (client) {
        await supabase.from('clients').update({
          total_earned: Number(client.total_earned) + amount,
        }).eq('id', project.client_id)
      }

      setPayments(prev => [data as ClientPayment, ...prev])
    }

    setSaving(false)
    if (error) { toast.error(error.message); return }
    setPaymentOpen(false)
    setPaymentForm({ amount: '', payment_type: 'part_payment', payment_date: new Date().toISOString().split('T')[0], payment_reference: '', notes: '' })
    toast.success('Payment recorded')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!project) return <div className="p-8 text-center text-gray-400">Project not found</div>

  const totalFee = Number(project.total_fee ?? 0)
  const received = Number(project.amount_received ?? 0)
  const balance = totalFee - received
  const progress = totalFee > 0 ? Math.min(100, Math.round((received / totalFee) * 100)) : 0
  const progressColor = progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-emerald-500' : 'bg-orange-400'

  const currentStatusIndex = STATUS_FLOW.indexOf(project.status as typeof STATUS_FLOW[number])
  const nextStatus = currentStatusIndex >= 0 && currentStatusIndex < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStatusIndex + 1]
    : null

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {client && (
              <Link href={`/clients/${client.id}`} className="text-sm text-emerald-600 hover:underline flex items-center gap-1 mt-0.5">
                {client.name} <ExternalLink size={12} />
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_COLORS[project.status] ?? ''}>
            {project.status.replace('_', ' ')}
          </Badge>
          {nextStatus && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 capitalize"
              onClick={() => updateStatus(nextStatus)}
              disabled={saving}
            >
              Mark as {nextStatus.replace('_', ' ')}
            </Button>
          )}
        </div>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Fee', value: totalFee ? formatCurrency(totalFee) : '—', color: 'text-gray-900' },
          { label: 'Received', value: formatCurrency(received), color: 'text-emerald-600' },
          { label: 'Balance Due', value: formatCurrency(balance), color: balance > 0 ? 'text-orange-500' : 'text-gray-400' },
          { label: 'Progress', value: `${progress}%`, color: progress >= 100 ? 'text-green-600' : 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      {totalFee > 0 && (
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Project details */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Project Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {[
            { label: 'Start Date', value: project.start_date ? formatDate(project.start_date) : '—' },
            { label: 'Deadline', value: project.deadline ? formatDate(project.deadline) : '—' },
            { label: 'Currency', value: project.currency },
            { label: 'Delivered', value: project.delivered_at ? formatDate(project.delivered_at) : '—' },
            { label: 'Completed', value: project.completed_at ? formatDate(project.completed_at) : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 uppercase font-medium">{label}</p>
              <p className="font-medium text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
          {project.description && (
            <div className="col-span-full">
              <p className="text-xs text-gray-400 uppercase font-medium">Description</p>
              <p className="text-gray-700 mt-0.5">{project.description}</p>
            </div>
          )}
          {project.notes && (
            <div className="col-span-full">
              <p className="text-xs text-gray-400 uppercase font-medium">Notes</p>
              <p className="text-gray-700 mt-0.5">{project.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Payment History</CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => setPaymentOpen(true)}>
            <Plus size={14} /> Record Payment
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No payments recorded yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {payments.map(pay => (
                <div key={pay.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{pay.payment_type.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(pay.payment_date)}
                      {pay.payment_reference ? ` · Ref: ${pay.payment_reference}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold text-emerald-600">{formatCurrency(pay.amount, pay.currency)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked receipts (expenses for this project) */}
      {receipts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Linked Expenses</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {receipts.map(r => (
                <Link
                  key={r.id}
                  href={`/receipts/${r.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{r.vendor_name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{formatDate(r.date)} · {r.category}</p>
                  </div>
                  <ChannelBadge channel={r.uploaded_via} />
                  <p className="font-semibold text-gray-700">{formatCurrency(r.amount, r.currency)}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Payment Modal */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment for {project.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Amount *</label>
                <Input
                  type="number"
                  className="mt-1"
                  placeholder="50000"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <Input
                  type="date"
                  className="mt-1"
                  value={paymentForm.payment_date}
                  onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Payment type</label>
              <Select value={paymentForm.payment_type} onValueChange={v => v && setPaymentForm(f => ({ ...f, payment_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="part_payment">Part payment</SelectItem>
                  <SelectItem value="full_payment">Full payment</SelectItem>
                  <SelectItem value="retainer">Retainer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Reference</label>
              <Input
                className="mt-1"
                placeholder="TRF123456"
                value={paymentForm.payment_reference}
                onChange={e => setPaymentForm(f => ({ ...f, payment_reference: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPaymentOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={addPayment}
                disabled={saving || !paymentForm.amount}
              >
                {saving ? 'Saving…' : `Record ${paymentForm.amount ? formatCurrency(Number(paymentForm.amount)) : 'Payment'}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
