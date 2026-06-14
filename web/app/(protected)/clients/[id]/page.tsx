'use client'
// clients/[id]/page.tsx
// Client detail — projects, payments, add payment modal

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Client, Project, ClientPayment } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Plus, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'

const PROJECT_STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const clientId = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [payments, setPayments] = useState<ClientPayment[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Modals
  const [projectOpen, setProjectOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [projectForm, setProjectForm] = useState({ name: '', description: '', total_fee: '', deadline: '', notes: '' })
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_type: 'part_payment', payment_date: new Date().toISOString().split('T')[0], payment_reference: '', project_id: '', notes: '' })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) return
      setOrgId(member.org_id)

      const [{ data: c }, { data: p }, { data: cp }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('client_payments').select('*').eq('client_id', clientId).order('payment_date', { ascending: false }),
      ])

      setClient(c as Client)
      setProjects((p as Project[]) ?? [])
      setPayments((cp as ClientPayment[]) ?? [])
      setLoading(false)
    }
    load()
  }, [clientId])

  async function addProject() {
    if (!orgId || !projectForm.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('projects').insert({
      org_id: orgId,
      client_id: clientId,
      name: projectForm.name,
      description: projectForm.description || null,
      total_fee: projectForm.total_fee ? Number(projectForm.total_fee) : null,
      deadline: projectForm.deadline || null,
      notes: projectForm.notes || null,
    }).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setProjects(prev => [data as Project, ...prev])
    setProjectOpen(false)
    setProjectForm({ name: '', description: '', total_fee: '', deadline: '', notes: '' })
    toast.success('Project created')
  }

  async function addPayment() {
    if (!orgId || !paymentForm.amount) return
    setSaving(true)
    const amount = Number(paymentForm.amount)
    const { data, error } = await supabase.from('client_payments').insert({
      org_id: orgId,
      client_id: clientId,
      project_id: paymentForm.project_id || null,
      amount,
      payment_type: paymentForm.payment_type,
      payment_date: paymentForm.payment_date,
      payment_reference: paymentForm.payment_reference || null,
      notes: paymentForm.notes || null,
    }).select().single()

    if (!error) {
      // Update client totals
      await supabase.from('clients').update({
        total_earned: Number(client?.total_earned ?? 0) + amount,
      }).eq('id', clientId)
      setClient(c => c ? { ...c, total_earned: Number(c.total_earned) + amount } : c)
      setPayments(prev => [data as ClientPayment, ...prev])

      // Update project amount_received if linked
      if (paymentForm.project_id) {
        await supabase.from('projects').update({
          amount_received: (projects.find(p => p.id === paymentForm.project_id)?.amount_received ?? 0) + amount
        }).eq('id', paymentForm.project_id)
        setProjects(prev => prev.map(p => p.id === paymentForm.project_id
          ? { ...p, amount_received: Number(p.amount_received) + amount }
          : p))
      }
    }

    setSaving(false)
    if (error) { toast.error(error.message); return }
    setPaymentOpen(false)
    setPaymentForm({ amount: '', payment_type: 'part_payment', payment_date: new Date().toISOString().split('T')[0], payment_reference: '', project_id: '', notes: '' })
    toast.success('Payment recorded')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!client) return <div className="p-8 text-center text-gray-400">Client not found</div>

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-500">
            {client.phone && `${client.phone} · `}
            {client.email && `${client.email} · `}
            Client since {formatDate(client.created_at)}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Earned', value: formatCurrency(client.total_earned), color: 'text-emerald-600' },
          { label: 'Paid This Session', value: formatCurrency(totalPaid), color: 'text-blue-600' },
          { label: 'Outstanding', value: formatCurrency(client.outstanding_balance), color: 'text-orange-500' },
          { label: 'Projects', value: String(projects.length), color: 'text-gray-900' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FolderOpen size={16} />Projects</CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => setProjectOpen(true)}>
            <Plus size={14} /> Add Project
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No projects yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {projects.map(p => (
                <div key={p.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    {p.deadline && <p className="text-xs text-gray-400 mt-0.5">Deadline: {formatDate(p.deadline)}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{p.total_fee ? formatCurrency(p.total_fee) : '—'}</p>
                    <p className="text-xs text-gray-400">Received: {formatCurrency(p.amount_received)}</p>
                  </div>
                  <Badge variant="outline" className={PROJECT_STATUS_COLORS[p.status] ?? ''}>
                    {p.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Payment History</CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => setPaymentOpen(true)}>
            <Plus size={14} /> Record Payment
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No payments yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {payments.map(pay => (
                <div key={pay.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{pay.payment_type.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-400">{formatDate(pay.payment_date)}{pay.payment_reference ? ` · Ref: ${pay.payment_reference}` : ''}</p>
                  </div>
                  <p className="font-semibold text-emerald-600">{formatCurrency(pay.amount, pay.currency)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Project Modal */}
      <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Project for {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Project name *</label>
              <Input className="mt-1" placeholder="Website redesign" value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Total fee (₦)</label>
                <Input type="number" className="mt-1" placeholder="150000" value={projectForm.total_fee} onChange={e => setProjectForm(f => ({ ...f, total_fee: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Deadline</label>
                <Input type="date" className="mt-1" value={projectForm.deadline} onChange={e => setProjectForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Input className="mt-1" placeholder="Brief description" value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setProjectOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={addProject} disabled={saving || !projectForm.name.trim()}>
                {saving ? 'Saving…' : 'Create Project'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Payment Modal */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment from {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Amount (₦) *</label>
                <Input type="number" className="mt-1" placeholder="50000" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <Input type="date" className="mt-1" value={paymentForm.payment_date} onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} />
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
            {projects.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Link to project</label>
                <Select value={paymentForm.project_id} onValueChange={v => v && setPaymentForm(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700">Reference / receipt no.</label>
              <Input className="mt-1" placeholder="TRF123456" value={paymentForm.payment_reference} onChange={e => setPaymentForm(f => ({ ...f, payment_reference: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPaymentOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={addPayment} disabled={saving || !paymentForm.amount}>
                {saving ? 'Saving…' : `Record ${paymentForm.amount ? formatCurrency(Number(paymentForm.amount)) : 'Payment'}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
