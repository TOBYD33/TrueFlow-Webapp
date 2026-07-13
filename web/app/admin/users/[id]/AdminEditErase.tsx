'use client'
// app/admin/users/[id]/AdminEditErase.tsx
// Edit user profile fields (Super + Support) and Permanently Erase
// (Super only, typed "Delete" confirmation, testing-phase immediate).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const PLANS = ['free', 'individual', 'family', 'freelancer', 'sme_starter', 'agency', 'sme_pro', 'studio', 'enterprise']

interface Props {
  userId: string
  orgId: string | null
  orgName: string
  canEdit: boolean
  canErase: boolean
  initial: { full_name: string; phone: string; email: string; org_name: string; plan: string }
}

export function AdminEditErase({ userId, orgId, orgName, canEdit, canErase, initial }: Props) {
  const router = useRouter()
  const [fields, setFields] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [erasing, setErasing] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, orgId, fields }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Update failed'); return }
      toast.success(json.changed.length ? `Updated: ${json.changed.join(', ')}` : 'No changes to save')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function erase() {
    if (confirmText !== 'Delete') return
    setErasing(true)
    try {
      const res = await fetch('/api/admin/erase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, confirmation: confirmText }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erasure failed'); setErasing(false); return }
      toast.success('Organisation permanently erased')
      router.push('/admin/users')
    } catch {
      toast.error('Erasure failed — network error')
      setErasing(false)
    }
  }

  const inputCls = 'w-full mt-1 h-10 px-3 rounded-xl border border-gray-800 bg-transparent text-sm text-gray-200 outline-none focus:border-[#6C63FF]'
  const labelCls = 'text-xs text-gray-500 uppercase tracking-wide'

  return (
    <div className="space-y-6">
      {/* Edit fields — Super + Support */}
      {canEdit && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Edit User</h2>
            <p className="text-xs text-gray-500 mt-0.5">Every change is written to the audit log with old and new values.</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full name</label>
              <input className={inputCls} value={fields.full_name} onChange={e => setFields(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={fields.phone} onChange={e => setFields(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} value={fields.email} onChange={e => setFields(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Organisation name</label>
              <input className={inputCls} value={fields.org_name} onChange={e => setFields(f => ({ ...f, org_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Plan</label>
              <select className={inputCls} value={fields.plan} onChange={e => setFields(f => ({ ...f, plan: e.target.value }))}>
                {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={save}
                disabled={saving}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#6C63FF' }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanently Erase — Super only */}
      {canErase && orgId && (
        <div className="bg-gray-900 border border-red-900/40 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-red-400">Permanently Erase</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Hard-deletes this organisation and all its data. Cannot be undone. Use Suspend for almost everything else.
              </p>
            </div>
            <button
              onClick={() => { setEraseOpen(true); setConfirmText('') }}
              className="h-9 px-4 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#FF6B6B' }}
            >
              Permanently Erase…
            </button>
          </div>
        </div>
      )}

      {/* Erase confirmation modal */}
      {eraseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !erasing && setEraseOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-red-900/50 p-6">
            <h3 className="text-lg font-bold text-red-400">Permanently erase {orgName}?</h3>
            <div className="text-sm text-gray-300 mt-3 space-y-2">
              <p>This will <strong>immediately and permanently destroy</strong>:</p>
              <ul className="list-disc pl-5 text-gray-400 space-y-1">
                <li>All receipts and expense history</li>
                <li>All client records and project history</li>
                <li>All payment history, reminders and budgets</li>
                <li>All team memberships and the user profiles that belong only to this organisation</li>
              </ul>
              <p className="font-semibold text-red-300">This action cannot be undone.</p>
            </div>
            <div className="mt-4">
              <label className="text-xs text-gray-500">
                Type <span className="font-mono font-bold text-gray-300">Delete</span> (case-sensitive) to enable the button:
              </label>
              <input
                className="w-full mt-1.5 h-10 px-3 rounded-xl border border-gray-700 bg-transparent text-sm text-gray-200 outline-none focus:border-red-500"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Delete"
                autoFocus
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEraseOpen(false)}
                disabled={erasing}
                className="flex-1 h-10 rounded-xl border border-gray-700 text-sm text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={erase}
                disabled={confirmText !== 'Delete' || erasing}
                className="flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#FF6B6B' }}
              >
                {erasing ? 'Erasing…' : 'Erase Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
