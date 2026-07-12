'use client'
// budgets/page.tsx
// Budget management — set per-category limits, track progress vs actual spend

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Budget, Receipt } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, CATEGORIES } from '@/lib/utils'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function progressColor(pct: number) {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-400'
  return 'bg-[#6C63FF]'
}

function progressTextColor(pct: number) {
  if (pct >= 100) return 'text-red-600'
  if (pct >= 70) return 'text-amber-600'
  return 'text-[#00A88A]'
}

export default function BudgetsPage() {
  const supabase = createClient()

  const { orgId } = useViewingContext()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editBudget, setEditBudget] = useState<Budget | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: '', amount: '' })

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const [{ data: b }, { data: r }] = await Promise.all([
        supabase.from('budgets').select('*').eq('org_id', orgId)
          .eq('month', currentMonth).eq('year', currentYear),
        supabase.from('receipts').select('category, amount').eq('org_id', orgId)
          .gte('date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`)
          .lte('date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`),
      ])

      setBudgets((b as Budget[]) ?? [])
      setReceipts((r as Receipt[]) ?? [])
      setLoading(false)
    }
    load()
  }, [orgId])

  const spentByCategory = useMemo(() =>
    receipts.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {}),
    [receipts]
  )

  function openAdd() {
    setEditBudget(null)
    setForm({ category: '', amount: '' })
    setModalOpen(true)
  }

  function openEdit(b: Budget) {
    setEditBudget(b)
    setForm({ category: b.category, amount: String(b.amount) })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!orgId || !form.category || !form.amount) return
    setSaving(true)

    if (editBudget) {
      const { error } = await supabase.from('budgets').update({ amount: Number(form.amount) }).eq('id', editBudget.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      setBudgets(prev => prev.map(b => b.id === editBudget.id ? { ...b, amount: Number(form.amount) } : b))
      toast.success('Budget updated')
    } else {
      const { data, error } = await supabase.from('budgets').upsert({
        org_id: orgId,
        category: form.category,
        amount: Number(form.amount),
        period: 'monthly',
        month: currentMonth,
        year: currentYear,
      }, { onConflict: 'org_id,category,month,year' }).select().single()
      if (error) { toast.error(error.message); setSaving(false); return }
      setBudgets(prev => {
        const exists = prev.find(b => b.category === form.category)
        if (exists) return prev.map(b => b.category === form.category ? data as Budget : b)
        return [...prev, data as Budget]
      })
      toast.success('Budget set')
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('budgets').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setBudgets(prev => prev.filter(b => b.id !== id))
    toast.success('Budget removed')
  }

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0)
  const totalSpent = Object.values(spentByCategory).reduce((s, v) => s + v, 0)
  const overallPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthLabel}</p>
        </div>
        <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2" onClick={openAdd}>
          <Plus size={16} /> Add Budget
        </Button>
      </div>

      {/* Overall summary */}
      {budgets.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall</span>
              <span className={cn('text-sm font-semibold', progressTextColor(overallPct))}>
                {formatCurrency(totalSpent)} / {formatCurrency(totalBudget)} ({overallPct}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', progressColor(overallPct))}
                style={{ width: `${Math.min(overallPct, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget cards */}
      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-gray-400">
            No budgets set for {monthLabel}. Add one above, or say "Set ₦20,000 budget for food" on WhatsApp.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const spent = spentByCategory[b.category] ?? 0
            const pct = b.amount ? Math.round((spent / Number(b.amount)) * 100) : 0
            const remaining = Number(b.amount) - spent
            return (
              <Card key={b.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-gray-900">{b.category}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-semibold', progressTextColor(pct))}>
                        {pct}%
                      </span>
                      <button onClick={() => openEdit(b)} className="text-gray-400 hover:text-gray-600">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(b.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={cn('h-full rounded-full transition-all', progressColor(pct))}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Spent: {formatCurrency(spent)}</span>
                    <span>Budget: {formatCurrency(Number(b.amount))}</span>
                    <span className={remaining < 0 ? 'text-red-500 font-medium' : ''}>
                      {remaining < 0 ? `Over by ${formatCurrency(Math.abs(remaining))}` : `${formatCurrency(remaining)} left`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editBudget ? `Edit ${editBudget.category} budget` : 'Set Budget'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editBudget && (
              <div>
                <label className="text-sm font-medium text-gray-700">Category</label>
                <Select value={form.category} onValueChange={v => v && setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700">Monthly limit (₦)</label>
              <Input
                type="number"
                className="mt-1"
                placeholder="50000"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-[#6C63FF] hover:bg-[#5A52E0]"
                onClick={handleSave}
                disabled={saving || !form.amount || (!editBudget && !form.category)}
              >
                {saving ? 'Saving…' : editBudget ? 'Update' : 'Set Budget'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
