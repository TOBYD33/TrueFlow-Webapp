'use client'
// ImpersonateButton.tsx
// Visible only to Super Admin and Support Admin.
// Requires a written reason before starting. Inserts to both tables before redirecting.

import { useState } from 'react'

interface Props {
  targetUserId: string
  targetOrgId: string | null
  targetName: string
}

export function ImpersonateButton({ targetUserId, targetOrgId, targetName }: Props) {
  const [showDialog, setShowDialog] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (!reason.trim()) {
      setError('A reason is required before starting impersonation')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/impersonation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, targetOrgId, reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start impersonation')
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setShowDialog(true); setError(null); setReason('') }}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-900/40 text-amber-400 border border-amber-800 hover:bg-amber-900/70 transition-colors"
      >
        Impersonate
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-amber-700/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-400 text-lg">👁</span>
              <h3 className="text-base font-bold text-white">Impersonate User</h3>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              You are about to view as <strong className="text-amber-300">{targetName}</strong>.
              This session is fully logged. You will be in read-only mode.
            </p>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1.5">
                Reason for impersonation <span className="text-red-400">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Investigating support ticket #1234, user reports missing receipts"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 mb-3">{error}</p>
            )}

            <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg px-3 py-2 mb-4">
              <p className="text-xs text-amber-400">
                ⚠️ This action is permanently logged with your admin ID, the reason, and a timestamp.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleStart}
                disabled={loading || !reason.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Starting…' : 'Start Impersonation'}
              </button>
              <button
                onClick={() => setShowDialog(false)}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
