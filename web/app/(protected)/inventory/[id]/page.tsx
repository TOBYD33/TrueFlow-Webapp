'use client'
// inventory/[id]/page.tsx
// Item detail — editable fields, quick stock actions, movement history.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, TrendingUp, TrendingDown, Archive } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Movement {
  id: string
  change_type: string
  quantity_change: number
  quantity_after: number
  notes: string | null
  created_at: string
}

export default function InventoryItemPage() {
  const supabase = createClient()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [item, setItem] = useState<any>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})

  // Action modal
  const [actionModal, setActionModal] = useState<'restock' | 'sale' | null>(null)
  const [actionQty, setActionQty] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [actionSaving, setActionSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: i }, { data: m }] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('id', id).single(),
        supabase.from('inventory_movements').select('*').eq('item_id', id).order('created_at', { ascending: false }).limit(50),
      ])
      if (!i) { router.push('/inventory'); return }
      setItem(i)
      setEditForm({
        name: i.name,
        sku: i.sku ?? '',
        category: i.category ?? '',
        unit_cost: i.unit_cost ?? '',
        unit_price: i.unit_price ?? '',
        low_stock_threshold: i.low_stock_threshold,
        description: i.description ?? '',
      })
      setMovements((m as Movement[]) ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  async function handleSaveEdit() {
    setSaving(true)
    const { error } = await supabase.from('inventory_items').update({
      name: editForm.name,
      sku: editForm.sku || null,
      category: editForm.category || null,
      unit_cost: editForm.unit_cost !== '' ? parseFloat(editForm.unit_cost) : null,
      unit_price: editForm.unit_price !== '' ? parseFloat(editForm.unit_price) : null,
      low_stock_threshold: parseFloat(editForm.low_stock_threshold) || 5,
      description: editForm.description || null,
    }).eq('id', id)
    if (error) { toast.error(error.message); setSaving(false); return }
    setItem((prev: any) => ({ ...prev, ...editForm }))
    setEditing(false)
    toast.success('Item updated')
    setSaving(false)
  }

  async function handleAction() {
    if (!actionModal || !actionQty) return
    const qty = parseFloat(actionQty)
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity'); return }
    setActionSaving(true)
    const change = actionModal === 'sale' ? -qty : qty
    const res = await fetch('/api/inventory/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: id,
        quantityChange: change,
        changeType: actionModal,
        notes: actionNotes || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Failed')
    } else {
      const newQty = item.quantity_on_hand + change
      setItem((prev: any) => ({ ...prev, quantity_on_hand: newQty }))
      const newMovement: Movement = {
        id: crypto.randomUUID(),
        change_type: actionModal,
        quantity_change: change,
        quantity_after: newQty,
        notes: actionNotes || null,
        created_at: new Date().toISOString(),
      }
      setMovements(prev => [newMovement, ...prev])
      toast.success(actionModal === 'sale' ? `${qty} units sold` : `${qty} units restocked`)
      setActionModal(null)
      setActionQty('')
      setActionNotes('')
    }
    setActionSaving(false)
  }

  async function handleArchive() {
    if (!confirm('Archive this item? It will be hidden from your inventory list.')) return
    const { error } = await supabase.from('inventory_items').update({ status: 'archived' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Item archived')
    router.push('/inventory')
  }

  function movementLabel(type: string) {
    if (type === 'restock') return { label: 'Restock', cls: 'bg-emerald-100 text-emerald-700' }
    if (type === 'sale') return { label: 'Sale', cls: 'bg-blue-100 text-blue-700' }
    return { label: 'Adjustment', cls: 'bg-gray-100 text-gray-600' }
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
  if (!item) return null

  const isLow = item.quantity_on_hand > 0 && item.quantity_on_hand <= item.low_stock_threshold
  const isOut = item.quantity_on_hand === 0

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            {item.category && <p className="text-sm text-gray-500 mt-0.5">{item.category}</p>}
          </div>
          {isOut && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">OUT OF STOCK</span>}
          {isLow && <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-semibold">LOW STOCK</span>}
        </div>
        <button onClick={handleArchive} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <Archive size={14} /> Archive
        </button>
      </div>

      {/* Quantity hero + action buttons */}
      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="text-center sm:text-left">
            <p className="text-xs text-gray-500 uppercase tracking-wide">On hand</p>
            <p className={cn('text-5xl font-bold mt-1', isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-gray-900')}>
              {item.quantity_on_hand}
            </p>
            <p className="text-xs text-gray-400 mt-1">Low stock alert at {item.low_stock_threshold} units</p>
          </div>
          <div className="flex gap-3 sm:ml-auto">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              onClick={() => { setActionModal('restock'); setActionQty(''); setActionNotes('') }}
            >
              <TrendingUp size={15} /> Restock
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 gap-2"
              onClick={() => { setActionModal('sale'); setActionQty(''); setActionNotes('') }}
            >
              <TrendingDown size={15} /> Record Sale
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Details / edit */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Item Details</CardTitle>
          {!editing
            ? <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            : <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
          }
        </CardHeader>
        <CardContent>
          {!editing ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['SKU', item.sku ?? '—'],
                ['Category', item.category ?? '—'],
                ['Unit cost', item.unit_cost ? formatCurrency(item.unit_cost) : '—'],
                ['Unit price', item.unit_price ? formatCurrency(item.unit_price) : '—'],
                ['Stock value', item.unit_cost ? formatCurrency(item.quantity_on_hand * item.unit_cost) : '—'],
                ['Low stock threshold', item.low_stock_threshold],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{val}</dd>
                </div>
              ))}
              {item.description && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Description</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{item.description}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Name</label>
                  <Input className="mt-1" value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">SKU</label>
                  <Input className="mt-1" value={editForm.sku} onChange={e => setEditForm((f: any) => ({ ...f, sku: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Category</label>
                  <Input className="mt-1" value={editForm.category} onChange={e => setEditForm((f: any) => ({ ...f, category: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Low stock threshold</label>
                  <Input className="mt-1" type="number" min="0" value={editForm.low_stock_threshold} onChange={e => setEditForm((f: any) => ({ ...f, low_stock_threshold: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Unit cost (₦)</label>
                  <Input className="mt-1" type="number" min="0" value={editForm.unit_cost} onChange={e => setEditForm((f: any) => ({ ...f, unit_cost: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Unit price (₦)</label>
                  <Input className="mt-1" type="number" min="0" value={editForm.unit_price} onChange={e => setEditForm((f: any) => ({ ...f, unit_price: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Description</label>
                <Input className="mt-1" value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Movement history */}
      <Card>
        <CardHeader><CardTitle className="text-base">Movement History</CardTitle></CardHeader>
        {movements.length === 0 ? (
          <CardContent className="py-6 text-center text-sm text-gray-400">No movements recorded yet.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">After</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map(m => {
                  const { label, cls } = movementLabel(m.change_type)
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', cls)}>{label}</span>
                      </td>
                      <td className={cn('px-4 py-3 text-right font-semibold', m.quantity_change >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {m.quantity_change >= 0 ? '+' : ''}{m.quantity_change}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{m.quantity_after}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{m.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Action modal */}
      <Dialog open={!!actionModal} onOpenChange={open => { if (!open) setActionModal(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{actionModal === 'restock' ? 'Restock' : 'Record Sale'} — {item.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Quantity</label>
              <Input
                type="number"
                min="0.01"
                step="any"
                className="mt-1"
                placeholder="e.g. 10"
                value={actionQty}
                onChange={e => setActionQty(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Current stock: {item.quantity_on_hand} units</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Notes <span className="text-gray-400">(optional)</span></label>
              <Input
                className="mt-1"
                placeholder={actionModal === 'sale' ? 'e.g. Market sale' : 'e.g. Supplier delivery'}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setActionModal(null)}>Cancel</Button>
              <Button
                className={cn('flex-1', actionModal === 'restock' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700')}
                onClick={handleAction}
                disabled={actionSaving || !actionQty}
              >
                {actionSaving ? 'Saving…' : actionModal === 'restock' ? 'Restock' : 'Record Sale'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
