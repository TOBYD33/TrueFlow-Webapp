'use client'
// inventory/page.tsx
// Inventory list — summary cards, item table with quick restock/sale actions.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { Plus, Package, AlertTriangle, TrendingDown, TrendingUp, Archive, ArchiveRestore } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface InventoryItem {
  id: string
  org_id: string
  name: string
  sku: string | null
  category: string | null
  quantity_on_hand: number
  unit_cost: number | null
  unit_price: number | null
  low_stock_threshold: number
  status: string
  created_at: string
}

export default function InventoryPage() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)

  // Quick action modal state
  const [actionModal, setActionModal] = useState<{ item: InventoryItem; type: 'restock' | 'sale' } | null>(null)
  const [actionQty, setActionQty] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) return

    async function load() {
      setLoading(true)
      const [{ data, error }, { count }] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('status', showArchived ? 'archived' : 'active')
          .order('name', { ascending: true }),
        supabase
          .from('inventory_items')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'archived'),
      ])

      if (error) toast.error(error.message)
      setItems((data as InventoryItem[]) ?? [])
      setArchivedCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [orgId, showArchived])

  async function handleQuickAction() {
    if (!actionModal || !actionQty) return
    const qty = parseFloat(actionQty)
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity'); return }
    setSaving(true)
    const change = actionModal.type === 'sale' ? -qty : qty
    const res = await fetch('/api/inventory/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: actionModal.item.id,
        quantityChange: change,
        changeType: actionModal.type,
        notes: actionNotes || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Failed')
    } else {
      setItems(prev => prev.map(i =>
        i.id === actionModal.item.id
          ? { ...i, quantity_on_hand: i.quantity_on_hand + change }
          : i
      ))
      toast.success(actionModal.type === 'sale' ? `${qty} units sold` : `${qty} units restocked`)
      setActionModal(null)
      setActionQty('')
      setActionNotes('')
    }
    setSaving(false)
  }

  async function handleArchive(item: InventoryItem) {
    if (!confirm(`Archive "${item.name}"? It will be hidden from your inventory.`)) return
    const { error } = await supabase.from('inventory_items').update({ status: 'archived' }).eq('id', item.id)
    if (error) { toast.error(error.message); return }
    setItems(prev => prev.filter(i => i.id !== item.id))
    setArchivedCount(prev => prev + 1)
    toast.success(`${item.name} archived`)
  }

  async function handleRestore(item: InventoryItem) {
    const { error } = await supabase.from('inventory_items').update({ status: 'active' }).eq('id', item.id)
    if (error) { toast.error(error.message); return }
    setItems(prev => prev.filter(i => i.id !== item.id))
    setArchivedCount(prev => Math.max(0, prev - 1))
    toast.success(`${item.name} restored`)
  }

  const totalValue = items.reduce((s, i) => s + (i.quantity_on_hand * (i.unit_cost ?? 0)), 0)
  const lowStockItems = items.filter(i => i.quantity_on_hand <= i.low_stock_threshold)
  const outOfStock = items.filter(i => i.quantity_on_hand === 0)

  function rowBg(item: InventoryItem) {
    if (item.quantity_on_hand === 0) return 'bg-red-50'
    if (item.quantity_on_hand <= item.low_stock_threshold) return 'bg-amber-50'
    return ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your stock levels</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline-offset-2 hover:underline"
          >
            {showArchived ? 'Back to active items' : `View archived${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
          </button>
          <Link href="/inventory/new">
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Plus size={16} /> Add Item
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Package size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Items tracked</p>
              <p className="text-2xl font-bold text-gray-900">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Stock value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={cn('p-2.5 rounded-lg', lowStockItems.length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-400')}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Low / out of stock</p>
              <p className={cn('text-2xl font-bold', lowStockItems.length > 0 ? 'text-amber-600' : 'text-gray-900')}>
                {lowStockItems.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-sm text-gray-400 py-12">Loading…</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package size={36} className="mx-auto text-gray-300 mb-3" />
            {showArchived ? (
              <p className="text-sm text-gray-500">No archived items.</p>
            ) : (
              <>
                <p className="text-sm text-gray-500">No inventory items yet.</p>
                <Link href="/inventory/new">
                  <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700 gap-2">
                    <Plus size={15} /> Add your first item
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">On Hand</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(item => (
                  <tr key={item.id} className={cn('hover:bg-gray-50 transition-colors', rowBg(item))}>
                    <td className="px-4 py-3">
                      <Link href={`/inventory/${item.id}`} className="font-medium text-gray-900 hover:text-emerald-600 transition-colors">
                        {item.name}
                      </Link>
                      {item.quantity_on_hand === 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">OUT</span>
                      )}
                      {item.quantity_on_hand > 0 && item.quantity_on_hand <= item.low_stock_threshold && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-semibold">LOW</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{item.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{item.quantity_on_hand}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{item.unit_cost ? formatCurrency(item.unit_cost) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{item.unit_price ? formatCurrency(item.unit_price) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      {item.unit_cost ? formatCurrency(item.quantity_on_hand * item.unit_cost) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {showArchived ? (
                          <button
                            onClick={() => handleRestore(item)}
                            className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                            title="Restore"
                          >
                            <ArchiveRestore size={13} /> Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => { setActionModal({ item, type: 'restock' }); setActionQty(''); setActionNotes('') }}
                              className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Restock"
                            >
                              <TrendingUp size={13} />
                            </button>
                            <button
                              onClick={() => { setActionModal({ item, type: 'sale' }); setActionQty(''); setActionNotes('') }}
                              className="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Record sale"
                            >
                              <TrendingDown size={13} />
                            </button>
                            <button
                              onClick={() => handleArchive(item)}
                              className="px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                              title="Archive"
                            >
                              <Archive size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Quick action modal */}
      <Dialog open={!!actionModal} onOpenChange={open => { if (!open) setActionModal(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionModal?.type === 'restock' ? 'Restock' : 'Record Sale'} — {actionModal?.item.name}
            </DialogTitle>
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
              {actionModal && (
                <p className="text-xs text-gray-400 mt-1">Current stock: {actionModal.item.quantity_on_hand} units</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Notes <span className="text-gray-400">(optional)</span></label>
              <Input
                className="mt-1"
                placeholder={actionModal?.type === 'sale' ? 'e.g. Market sale' : 'e.g. Supplier delivery'}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setActionModal(null)}>Cancel</Button>
              <Button
                className={cn('flex-1', actionModal?.type === 'restock' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700')}
                onClick={handleQuickAction}
                disabled={saving || !actionQty}
              >
                {saving ? 'Saving…' : actionModal?.type === 'restock' ? 'Restock' : 'Record Sale'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
