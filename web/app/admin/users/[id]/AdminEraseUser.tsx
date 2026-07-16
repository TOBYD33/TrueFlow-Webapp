'use client'
// app/admin/users/[id]/AdminEraseUser.tsx
// Permanently Erase USER — deliberately separate from AdminEditErase's
// "Permanently Erase" (which only wipes ONE organization's data). This
// finds every org the person OWNS, erases each one, then wipes their
// entire identity: profile, Supabase Auth login, WhatsApp session and
// conversation history. Super Admin only.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  profileId: string
  fullName: string | null
  phone: string | null
  canErase: boolean
}

interface Preview {
  fullName: string | null
  phone: string | null
  orgs: { id: string; name: string; plan: string }[]
}

export function AdminEraseUser({ profileId, fullName, phone, canErase }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [erasing, setErasing] = useState(false)

  async function openModal() {
    setOpen(true)
    setConfirmText('')
    setPreview(null)
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/admin/erase-user?profileId=${encodeURIComponent(profileId)}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not load preview'); setOpen(false); return }
      setPreview({ fullName: json.fullName, phone: json.phone, orgs: json.orgs })
    } finally {
      setLoadingPreview(false)
    }
  }

  async function erase() {
    if (confirmText !== 'Delete') return
    setErasing(true)
    try {
      const res = await fetch('/api/admin/erase-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, confirmation: confirmText }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Erasure failed'); setErasing(false); return }
      toast.success('User permanently erased')
      router.push('/admin/users')
    } catch {
      toast.error('Erasure failed — network error')
      setErasing(false)
    }
  }

  if (!canErase) return null

  const orgCount = preview?.orgs.length ?? 0

  return (
    <div className="bg-gray-900 border border-red-900/40 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-red-400">Permanently Erase User</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Hard-deletes every organisation this person owns, then their profile, login, and WhatsApp
            history. Distinct from erasing a single organisation. Cannot be undone.
          </p>
        </div>
        <button
          onClick={openModal}
          className="h-9 px-4 rounded-xl text-sm font-semibold text-white shrink-0"
          style={{ background: '#FF6B6B' }}
        >
          Permanently Erase User…
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !erasing && setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-red-900/50 p-6">
            <h3 className="text-lg font-bold text-red-400">
              Permanently erase {fullName || phone || 'this user'}?
            </h3>

            {loadingPreview ? (
              <p className="text-sm text-gray-400 mt-3">Checking what this will destroy…</p>
            ) : (
              <div className="text-sm text-gray-300 mt-3 space-y-2">
                <p>This will <strong>immediately and permanently destroy</strong>:</p>
                {orgCount > 0 ? (
                  <>
                    <p className="text-gray-400">
                      {orgCount} organisation{orgCount > 1 ? 's' : ''} owned by this person:
                    </p>
                    <ul className="list-disc pl-5 text-gray-400 space-y-1">
                      {preview!.orgs.map(o => (
                        <li key={o.id}><span className="text-gray-300 font-medium">{o.name}</span> ({o.plan})</li>
                      ))}
                    </ul>
                    <p className="text-gray-400">— all receipts, clients, projects, invoices, and payment history in each.</p>
                  </>
                ) : (
                  <p className="text-gray-400">This person owns no organisations — only their identity will be erased.</p>
                )}
                <p className="text-gray-400">
                  Plus this person&apos;s entire TrueFlow identity: profile, login, and WhatsApp session/conversation history
                  {preview?.phone ? <> for <span className="font-mono text-gray-300">{preview.phone}</span></> : null}.
                </p>
                <p className="font-semibold text-red-300">This action cannot be undone.</p>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs text-gray-500">
                Type <span className="font-mono font-bold text-gray-300">Delete</span> (case-sensitive) to enable the button:
              </label>
              <input
                className="w-full mt-1.5 h-10 px-3 rounded-xl border border-gray-700 bg-transparent text-sm text-gray-200 outline-none focus:border-red-500"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Delete"
                disabled={loadingPreview}
                autoFocus
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={erasing}
                className="flex-1 h-10 rounded-xl border border-gray-700 text-sm text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={erase}
                disabled={confirmText !== 'Delete' || erasing || loadingPreview}
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
