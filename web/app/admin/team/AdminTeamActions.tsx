'use client'
// AdminTeamActions.tsx
// Client component — invite new admin, change role, revoke access.
// Super Admin only. Super role never appears in the role dropdown.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ASSIGNABLE_ROLES = [
  { value: 'support', label: 'Support Admin' },
  { value: 'finance', label: 'Finance Admin' },
  { value: 'readonly', label: 'Read Only Admin' },
]

interface Props {
  currentUserId: string
  targetId?: string
  targetName?: string
  currentRole?: string
  inline?: boolean
}

export function AdminTeamActions({ currentUserId, targetId, targetName, currentRole, inline }: Props) {
  const router = useRouter()
  const [showInvite, setShowInvite] = useState(false)
  const [showChange, setShowChange] = useState(false)
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('support')
  const [newRole, setNewRole] = useState(currentRole ?? 'support')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleInvite() {
    if (!phone.trim()) { setError('Phone number is required'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setSuccess(`${role} access granted to ${phone}`)
      setShowInvite(false)
      setPhone('')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleChangeRole() {
    if (newRole === currentRole) { setError('Same as current role'); return }
    if (newRole === 'super') { setError('Super Admin cannot be assigned via UI'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/team/change-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setShowChange(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke() {
    if (!confirm(`Revoke admin access for ${targetName}? They will lose all admin privileges immediately.`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/team/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Inline mode: change role + revoke buttons for a specific row
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {showChange ? (
          <div className="flex items-center gap-2">
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
            >
              {ASSIGNABLE_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button onClick={handleChangeRole} disabled={loading} className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-500 disabled:opacity-50">
              {loading ? '…' : 'Save'}
            </button>
            <button onClick={() => setShowChange(false)} className="text-xs text-gray-500 hover:text-gray-300">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => { setShowChange(true); setError(null) }}
              className="text-xs px-2.5 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              Change role
            </button>
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded bg-red-900/40 text-red-400 hover:bg-red-900/70 transition-colors disabled:opacity-50"
            >
              Revoke
            </button>
          </>
        )}
      </div>
    )
  }

  // Top-level mode: Invite Admin button
  return (
    <div className="relative">
      {success && (
        <p className="text-xs text-emerald-400 mb-2">{success}</p>
      )}
      <button
        onClick={() => { setShowInvite(true); setError(null); setSuccess(null) }}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
      >
        + Invite Admin
      </button>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Invite Platform Admin</h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter the TrueFlio phone number of the person to grant admin access.
              Super Admin cannot be assigned here — use direct SQL only.
            </p>

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Phone number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+2348012345678"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleInvite}
                disabled={loading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
              >
                {loading ? 'Granting…' : 'Grant Access'}
              </button>
              <button
                onClick={() => { setShowInvite(false); setError(null) }}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
