'use client'
// receipts/[id]/page.tsx
// Receipt detail — image viewer, AI transcript, editable fields, attach to client

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Receipt, Client, Project } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChannelBadge } from '@/components/ChannelBadge'
import { formatCurrency, formatDate, CATEGORIES } from '@/lib/utils'
import { ArrowLeft, Trash2, Paperclip, Save, ImageOff } from 'lucide-react'
import { toast } from 'sonner'

export default function ReceiptDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const receiptId = params.id as string

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  // Editable fields
  const [form, setForm] = useState({
    vendor_name: '',
    amount: '',
    date: '',
    category: '',
    tax_amount: '',
    notes: '',
  })

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: member } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id)
          .single()

        if (!member) return
        setOrgId(member.org_id)

        const [{ data: r }, { data: c }] = await Promise.all([
          supabase.from('receipts').select('*').eq('id', receiptId).single(),
          supabase.from('clients').select('*').eq('org_id', member.org_id).eq('status', 'active').order('name'),
        ])

        if (r) {
          setReceipt(r as Receipt)
          setForm({
            vendor_name: r.vendor_name ?? '',
            amount: String(r.amount ?? ''),
            date: r.date ?? '',
            category: r.category ?? 'Other',
            tax_amount: String(r.tax_amount ?? ''),
            notes: r.notes ?? '',
          })
        }
        setClients((c as Client[]) ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [receiptId])

  // Load projects when client is selected in attach modal
  useEffect(() => {
    if (!selectedClientId) { setProjects([]); return }
    supabase
      .from('projects')
      .select('*')
      .eq('client_id', selectedClientId)
      .order('name')
      .then(({ data }) => setProjects((data as Project[]) ?? []))
  }, [selectedClientId])

  async function handleSave() {
    if (!receipt) return
    setSaving(true)
    const { error } = await supabase.from('receipts').update({
      vendor_name: form.vendor_name || null,
      amount: form.amount ? Number(form.amount) : receipt.amount,
      date: form.date,
      category: form.category,
      tax_amount: form.tax_amount ? Number(form.tax_amount) : null,
      notes: form.notes || null,
    }).eq('id', receiptId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setReceipt(prev => prev ? {
      ...prev,
      vendor_name: form.vendor_name || null,
      amount: Number(form.amount),
      date: form.date,
      category: form.category as Receipt['category'],
      tax_amount: form.tax_amount ? Number(form.tax_amount) : null,
      notes: form.notes || null,
    } : prev)
    toast.success('Receipt updated')
  }

  async function handleDelete() {
    const { error } = await supabase.from('receipts').delete().eq('id', receiptId)
    if (error) { toast.error(error.message); return }
    toast.success('Receipt deleted')
    router.push('/receipts')
  }

  async function handleAttach() {
    if (!selectedClientId) return
    const { error } = await supabase.from('receipts').update({
      client_id: selectedClientId,
      project_id: selectedProjectId || null,
    }).eq('id', receiptId)
    if (error) { toast.error(error.message); return }
    const client = clients.find(c => c.id === selectedClientId)
    toast.success(`Attached to ${client?.name}`)
    setAttachOpen(false)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!receipt) return <div className="p-8 text-center text-gray-400">Receipt not found</div>

  const confidenceColor = receipt.ai_confidence === 'high'
    ? 'bg-[#00D4AA]/10 text-[#00A88A]'
    : receipt.ai_confidence === 'medium'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {receipt.vendor_name ?? 'Unknown Vendor'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(receipt.date)} · {formatCurrency(receipt.amount, receipt.currency)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChannelBadge channel={receipt.uploaded_via} />
          {receipt.ai_confidence && (
            <Badge variant="outline" className={confidenceColor}>
              AI: {receipt.ai_confidence}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — receipt image + AI transcript */}
        <div className="space-y-4">
          {/* Receipt image */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Receipt Image</CardTitle>
            </CardHeader>
            <CardContent>
              {receipt.image_url ? (
                <img
                  src={receipt.image_url}
                  alt="Receipt"
                  className="w-full rounded-lg border border-gray-200 object-contain max-h-96"
                />
              ) : (
                <div className="w-full h-48 bg-gray-50 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <ImageOff size={32} />
                  <p className="text-sm">No image available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI transcript */}
          {receipt.ai_transcript && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">AI Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 rounded-lg p-3">
                  {receipt.ai_transcript}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — editable fields */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Receipt Details</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[#00A88A] border-[#00D4AA]/30 hover:bg-[#00D4AA]/5"
                  onClick={() => setAttachOpen(true)}
                >
                  <Paperclip size={14} /> Attach to Client
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-[#6C63FF] hover:bg-[#5A52E0]"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save size={14} /> {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Vendor</label>
                <Input
                  className="mt-1"
                  placeholder="Vendor name"
                  value={form.vendor_name}
                  onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Amount ({receipt.currency})</label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Tax Amount</label>
                  <Input
                    type="number"
                    className="mt-1"
                    placeholder="0"
                    value={form.tax_amount}
                    onChange={e => setForm(f => ({ ...f, tax_amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Date</label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Category</label>
                  <Select value={form.category} onValueChange={v => v && setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <Input
                  className="mt-1"
                  placeholder="Any notes about this receipt"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Meta info */}
          <Card>
            <CardContent className="p-4 space-y-2 text-sm text-gray-500">
              <div className="flex justify-between">
                <span>Receipt ID</span>
                <span className="font-mono text-xs text-gray-400">{receipt.id.slice(0, 8)}…</span>
              </div>
              <div className="flex justify-between">
                <span>Uploaded via</span>
                <ChannelBadge channel={receipt.uploaded_via} />
              </div>
              <div className="flex justify-between">
                <span>Verified</span>
                <span className={receipt.is_verified ? 'text-[#00A88A] font-medium' : 'text-gray-400'}>
                  {receipt.is_verified ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Created</span>
                <span>{formatDate(receipt.created_at)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Delete */}
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 size={15} /> Delete this receipt
          </button>
        </div>
      </div>

      {/* Attach to client modal */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Attach to Client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Client</label>
              <Select value={selectedClientId} onValueChange={v => { setSelectedClientId(v ?? ''); setSelectedProjectId('') }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {projects.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Project (optional)</label>
                <Select value={selectedProjectId} onValueChange={v => v && setSelectedProjectId(v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setAttachOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-[#6C63FF] hover:bg-[#5A52E0]"
                onClick={handleAttach}
                disabled={!selectedClientId}
              >
                Attach
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Receipt?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            This will permanently delete the receipt from <strong>{receipt.vendor_name ?? 'Unknown Vendor'}</strong> for {formatCurrency(receipt.amount, receipt.currency)}. This cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
