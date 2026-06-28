'use client'
// invoices/new/page.tsx
// Create a new invoice — client, line items, tax, save as draft or mark sent

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Client, Project, LineItem } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

function emptyLineItem(): LineItem {
  return { description: '', quantity: 1, unit_price: 0, total: 0 }
}

export default function NewInvoicePage() {
  const supabase = createClient()
  const router = useRouter()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [saving, setSaving] = useState(false)

  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()])
  const [taxRate, setTaxRate] = useState(0)
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member, error: memberError } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) { console.error('No org membership found:', memberError?.message); return }
      setOrgId(member.org_id)
      const { data } = await supabase.from('clients').select('*').eq('org_id', member.org_id).eq('status', 'active').order('name')
      setClients((data as Client[]) ?? [])
    }
    load()
  }, [])

  useEffect(() => {
    if (!clientId || !orgId) { setProjects([]); return }
    supabase.from('projects').select('*').eq('client_id', clientId).then(({ data }) => {
      setProjects((data as Project[]) ?? [])
    })
  }, [clientId, orgId])

  // Auto-fill from project
  useEffect(() => {
    if (!projectId) return
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    const balance = Number(project.balance_due ?? 0)
    if (balance > 0) {
      setLineItems([{ description: project.name, quantity: 1, unit_price: balance, total: balance }])
    }
  }, [projectId])

  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => {
      const next = [...prev]
      const item = { ...next[i], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.total = Number(item.quantity) * Number(item.unit_price)
      }
      next[i] = item
      return next
    })
  }

  const subtotal = lineItems.reduce((s, i) => s + Number(i.total), 0)
  const taxAmount = subtotal * (taxRate / 100)
  const totalAmount = subtotal + taxAmount

  async function save(status: 'draft' | 'sent') {
    if (!orgId) return
    const selectedClient = clients.find(c => c.id === clientId)
    setSaving(true)

    // Generate invoice number: INV-YYYY-NNN
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data, error } = await supabase.from('invoices').insert({
      org_id: orgId,
      client_id: clientId || null,
      project_id: projectId || null,
      invoice_number: invoiceNumber,
      client_name: selectedClient?.name ?? null,
      client_email: selectedClient?.email ?? null,
      line_items: lineItems,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: 'NGN',
      status,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: dueDate || null,
      notes: notes || null,
    }).select().single()

    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Invoice ${invoiceNumber} ${status === 'draft' ? 'saved as draft' : 'created'}`)
    router.push(`/invoices/${(data as { id: string }).id}`)
  }

  const hasItems = lineItems.some(i => i.description.trim() && i.total > 0)

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Invoice</h1>
      </div>

      {/* Client + Project */}
      <Card>
        <CardHeader><CardTitle className="text-base">Bill To</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Client</label>
              <Select value={clientId} onValueChange={v => { if (v) { setClientId(v); setProjectId('') } }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {projects.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Project (optional)</label>
                <Select value={projectId} onValueChange={v => v && setProjectId(v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Due date</label>
            <Input type="date" className="mt-1 w-full sm:w-48" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setLineItems(p => [...p, emptyLineItem()])}>
            <Plus size={14} /> Add Line
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Desktop header — hidden on mobile */}
          <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1">
            <span className="col-span-6">Description</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-2 text-right">Unit Price</span>
            <span className="col-span-1 text-right">Total</span>
            <span className="col-span-1" />
          </div>
          {lineItems.map((item, i) => (
            <div key={i} className="flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-center bg-gray-50 sm:bg-transparent rounded-lg sm:rounded-none p-3 sm:p-0">
              <Input
                className="sm:col-span-6 text-sm"
                placeholder="Description of service"
                value={item.description}
                onChange={e => updateItem(i, 'description', e.target.value)}
              />
              <div className="flex gap-2 sm:contents">
                <div className="flex-1 sm:contents">
                  <label className="text-xs text-gray-400 sm:hidden mb-0.5 block">Qty</label>
                  <Input
                    type="number"
                    className="sm:col-span-2 text-sm text-right"
                    value={item.quantity}
                    min={1}
                    onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
                  />
                </div>
                <div className="flex-1 sm:contents">
                  <label className="text-xs text-gray-400 sm:hidden mb-0.5 block">Unit Price</label>
                  <Input
                    type="number"
                    className="sm:col-span-2 text-sm text-right"
                    placeholder="0"
                    value={item.unit_price || ''}
                    onChange={e => updateItem(i, 'unit_price', Number(e.target.value))}
                  />
                </div>
              </div>
              <span className="sm:col-span-1 text-right text-sm font-medium text-gray-700 text-right">
                {item.total > 0 ? formatCurrency(item.total) : '—'}
              </span>
              <button
                className="sm:col-span-1 flex justify-end text-gray-300 hover:text-red-400"
                onClick={() => setLineItems(p => p.filter((_, idx) => idx !== i))}
                disabled={lineItems.length === 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Totals */}
          <div className="border-t pt-4 mt-4 space-y-2">
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium w-28 text-right">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-end items-center gap-4 text-sm">
              <span className="text-gray-500">Tax (%)</span>
              <Input
                type="number"
                className="w-20 text-right"
                value={taxRate || ''}
                placeholder="0"
                onChange={e => setTaxRate(Number(e.target.value))}
              />
              <span className="font-medium w-28 text-right">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-end gap-4 text-sm font-bold border-t pt-2">
              <span>Total</span>
              <span className="w-28 text-right text-emerald-600 text-base">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-5">
          <label className="text-sm font-medium text-gray-700">Notes / Payment terms</label>
          <textarea
            className="mt-1 w-full rounded-md border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
            rows={3}
            placeholder="E.g. Payment due within 7 days. Bank: GTB 0123456789"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button
          variant="outline"
          disabled={saving || !hasItems}
          onClick={() => save('draft')}
        >
          {saving ? 'Saving…' : 'Save as Draft'}
        </Button>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          disabled={saving || !hasItems || !clientId}
          onClick={() => save('sent')}
        >
          {saving ? 'Saving…' : 'Create Invoice'}
        </Button>
      </div>
    </div>
  )
}
