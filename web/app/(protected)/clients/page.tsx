'use client'
// clients/page.tsx
// Client list with add client modal and summary stats

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Client } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { UserPlus, Search, Phone, Mail, ChevronRight, IdCard } from 'lucide-react'
import { toast } from 'sonner'
import { usePageTools } from '@/components/shared/PageTools'

export default function ClientsPage() {
  const supabase = createClient()
  const router = useRouter()

  const { orgId } = useViewingContext()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })

  useEffect(() => {
    if (!orgId) {
      // orgId resolves once, server-side, before this page ever renders —
      // null here means no organization was found for this account, not
      // "still loading", so show a clear message instead of spinning forever.
      setLoading(false)
      setLoadError('We could not find your organization. Try logging out and back in, or contact support@gettrueflow.com if this keeps happening.')
      return
    }

    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setLoading(false)
        setLoadError('This is taking longer than expected. Please refresh the page.')
      }
    }, 15000)

    async function load() {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      clearTimeout(timeout)
      if (error) {
        setLoadError(error.message || 'Could not load clients. Please try again.')
        setLoading(false)
        return
      }
      setClients((data as Client[]) ?? [])
      setLoading(false)
    }
    load()

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [orgId])

  const { query: headerQuery } = usePageTools({
    searchable: true,
    exportName: 'clients',
    exportRows: () =>
      filtered.map(c => ({
        name: c.name,
        phone: c.phone ?? '',
        email: c.email ?? '',
        status: c.status,
        total_earned: c.total_earned,
        outstanding_balance: c.outstanding_balance,
      })),
  })

  const effectiveSearch = search || headerQuery
  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
    (c.phone ?? '').includes(effectiveSearch) ||
    (c.email ?? '').toLowerCase().includes(effectiveSearch.toLowerCase())
  )

  // Leads never inflate real business totals — active clients only
  const activeClients = clients.filter(c => c.status === 'active')
  const totalEarned = activeClients.reduce((s, c) => s + Number(c.total_earned), 0)
  const totalOutstanding = activeClients.reduce((s, c) => s + Number(c.outstanding_balance), 0)
  const activeCount = activeClients.length

  async function handleAdd() {
    if (!orgId || !form.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clients').insert({
      org_id: orgId,
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      created_via: 'web',
    }).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setClients(prev => [data as Client, ...prev])
    setAddOpen(false)
    setForm({ name: '', phone: '', email: '', address: '', notes: '' })
    toast.success('Client added')
  }

  const statusColor = (s: string) =>
    s === 'active' ? 'bg-[#00D4AA]/10 text-[#00A88A]'
    : s === 'lead' ? 'bg-[#6C63FF]/10 text-[#6C63FF]'
    : s === 'inactive' ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} clients · Money In</p>
        </div>
        <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2" onClick={() => setAddOpen(true)}>
          <UserPlus size={16} /> Add Client
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase">Total Earned</p>
            <p className="text-2xl font-bold text-[#00A88A] mt-1">{formatCurrency(totalEarned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase">Outstanding</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium uppercase">Active Clients</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{activeCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + list */}
      <Card>
        <CardHeader>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-sm text-red-500">{loadError}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {search ? 'No clients match your search' : 'No clients yet — add your first client'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(client => (
                <div
                  key={client.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/clients/${client.id}`)}
                >
                  <div className="w-10 h-10 rounded-full bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {client.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{client.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {client.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{client.phone}</span>}
                      {client.email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} />{client.email}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900">{formatCurrency(client.total_earned)}</p>
                    {client.outstanding_balance > 0 && (
                      <p className="text-xs text-orange-500">₦{Number(client.outstanding_balance).toLocaleString()} due</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`gap-1 ${statusColor(client.status)}`}>
                    {client.status === 'lead' && <IdCard size={11} />}
                    {client.status === 'lead' ? 'Lead' : client.status}
                  </Badge>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add client modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Client name *</label>
              <Input className="mt-1" placeholder="Adaye Fashion House" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input className="mt-1" placeholder="+2348012345678" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <Input className="mt-1" placeholder="client@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Input className="mt-1" placeholder="Lagos, Nigeria" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <Input className="mt-1" placeholder="Any notes about this client" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={handleAdd} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : 'Add Client'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
