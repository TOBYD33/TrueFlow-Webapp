'use client'
// ReceiptUpload.tsx
// Drag-and-drop receipt upload → Claude Vision scan → confirm modal → save

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ScannedReceipt } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, CATEGORIES } from '@/lib/utils'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ReceiptUploadProps {
  orgId: string
  onSave?: () => void
}

export function ReceiptUpload({ orgId, onSave }: ReceiptUploadProps) {
  const supabase = createClient()
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState<ScannedReceipt | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setScanning(true)

    const formData = new FormData()
    formData.append('image', f)

    try {
      const res = await fetch('/api/scan', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Scan failed')
      const data: ScannedReceipt = await res.json()
      setScanned(data)
    } catch {
      toast.error('Could not scan receipt. Fill in details manually.')
      setScanned({
        vendor_name: null,
        amount: 0,
        currency: 'NGN',
        tax_amount: null,
        date: new Date().toISOString().split('T')[0],
        category: 'Other',
        confidence: 'low',
      })
    } finally {
      setScanning(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f && f.type.startsWith('image/')) handleFile(f)
    },
    [handleFile]
  )

  async function handleSave() {
    if (!scanned || !file) return
    setSaving(true)

    // Get current user id for uploaded_by
    const { data: { user } } = await supabase.auth.getUser()

    // Upload image to Supabase Storage
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `receipts/${orgId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, file, { contentType: file.type })

    if (uploadError) {
      console.warn('Storage upload failed (image will not be saved):', uploadError.message)
    }

    const imageUrl = uploadError
      ? null
      : supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl

    const { error } = await supabase.from('receipts').insert({
      org_id: orgId,
      uploaded_by: user?.id ?? null,
      uploaded_via: 'web',
      vendor_name: scanned.vendor_name || null,
      amount: scanned.amount,
      currency: scanned.currency,
      tax_amount: scanned.tax_amount ?? null,
      date: scanned.date,
      category: scanned.category,
      ai_confidence: scanned.confidence,
      image_url: imageUrl,
    })

    setSaving(false)
    if (error) {
      console.error('Receipt insert failed:', error)
      toast.error(error.message)
      return
    }

    toast.success('Receipt saved!')
    setScanned(null)
    setFile(null)
    onSave?.()
  }

  return (
    <>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'
        }`}
        onClick={() => document.getElementById('receipt-file')?.click()}
      >
        {scanning ? (
          <div className="flex flex-col items-center gap-2 text-emerald-600">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm font-medium">Scanning with AI…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Upload size={28} />
            <p className="text-sm font-medium">Drag & drop a receipt image or click to upload</p>
            <p className="text-xs">JPG, PNG, WEBP supported</p>
          </div>
        )}
        <input
          id="receipt-file"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Confirm modal */}
      <Dialog open={!!scanned} onOpenChange={open => { if (!open) { setScanned(null); setFile(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Receipt Details</DialogTitle>
          </DialogHeader>
          {scanned && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 uppercase">Vendor</label>
                  <Input
                    value={scanned.vendor_name ?? ''}
                    onChange={e => setScanned({ ...scanned, vendor_name: e.target.value })}
                    placeholder="Vendor name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Amount (₦)</label>
                  <Input
                    type="number"
                    value={scanned.amount}
                    onChange={e => setScanned({ ...scanned, amount: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Tax (₦)</label>
                  <Input
                    type="number"
                    value={scanned.tax_amount ?? ''}
                    onChange={e => setScanned({ ...scanned, tax_amount: e.target.value ? Number(e.target.value) : null })}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Date</label>
                  <Input
                    type="date"
                    value={scanned.date}
                    onChange={e => setScanned({ ...scanned, date: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Category</label>
                  <Select
                    value={scanned.category}
                    onValueChange={v => setScanned({ ...scanned, category: v as ScannedReceipt['category'] })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {scanned.confidence && (
                <p className="text-xs text-gray-400">
                  AI confidence: <span className="font-medium">{scanned.confidence}</span>
                  {scanned.confidence !== 'high' && ' — please review carefully'}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setScanned(null); setFile(null) }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : `Save ${formatCurrency(scanned.amount, scanned.currency)}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
