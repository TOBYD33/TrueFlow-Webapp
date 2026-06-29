'use client'
// inventory/new/page.tsx
// Add a new inventory item with opening stock quantity.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewInventoryItemPage() {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    openingQty: '0',
    unitCost: '',
    unitPrice: '',
    lowStockThreshold: '5',
    description: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Item name is required'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not logged in'); setSaving(false); return }
    const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
    if (!member) { toast.error('No organisation found'); setSaving(false); return }

    // Create the item
    const { data: item, error } = await supabase
      .from('inventory_items')
      .insert({
        org_id: member.org_id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        quantity_on_hand: parseFloat(form.openingQty) || 0,
        unit_cost: form.unitCost ? parseFloat(form.unitCost) : null,
        unit_price: form.unitPrice ? parseFloat(form.unitPrice) : null,
        low_stock_threshold: parseFloat(form.lowStockThreshold) || 5,
        description: form.description.trim() || null,
      })
      .select()
      .single()

    if (error) { toast.error(error.message); setSaving(false); return }

    // Log opening stock as a restock movement if qty > 0
    const openingQty = parseFloat(form.openingQty) || 0
    if (openingQty > 0) {
      await fetch('/api/inventory/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          quantityChange: openingQty,
          changeType: 'restock',
          notes: 'Opening stock',
        }),
      })
    }

    toast.success(`${form.name} added to inventory`)
    router.push('/inventory')
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Item</h1>
          <p className="text-sm text-gray-500 mt-0.5">New inventory item</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Item details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Item name <span className="text-red-500">*</span></label>
            <Input className="mt-1" placeholder="e.g. Ankara Fabric" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">SKU <span className="text-gray-400">(optional)</span></label>
              <Input className="mt-1" placeholder="e.g. ANK-001" value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Category <span className="text-gray-400">(optional)</span></label>
              <Input className="mt-1" placeholder="e.g. Fabric" value={form.category} onChange={e => set('category', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Description <span className="text-gray-400">(optional)</span></label>
            <Input className="mt-1" placeholder="Short description" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Stock & pricing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Opening quantity</label>
            <Input className="mt-1" type="number" min="0" step="any" placeholder="0" value={form.openingQty} onChange={e => set('openingQty', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Unit cost (₦) <span className="text-gray-400">— what you pay</span></label>
              <Input className="mt-1" type="number" min="0" step="any" placeholder="2000" value={form.unitCost} onChange={e => set('unitCost', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Unit price (₦) <span className="text-gray-400">— what you sell for</span></label>
              <Input className="mt-1" type="number" min="0" step="any" placeholder="3500" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Low stock alert threshold</label>
            <Input className="mt-1" type="number" min="0" step="any" placeholder="5" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">You'll be alerted when stock falls to this number.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Link href="/inventory" className="flex-1">
          <Button variant="outline" className="w-full">Cancel</Button>
        </Link>
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
        >
          {saving ? 'Saving…' : 'Add Item'}
        </Button>
      </div>
    </div>
  )
}
