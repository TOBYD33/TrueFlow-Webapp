'use client'
// TeamActions.tsx
// Client component — invite modal, permission toggle rows, remove/cancel, accountant link controls.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Link2, Trash2 } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'family_member', label: 'Family Member' },
  { value: 'viewer', label: 'Viewer' },
]

const ROLE_DEFAULTS: Record<string, { whatsapp: boolean; clients: boolean; export: boolean }> = {
  admin:         { whatsapp: true,  clients: true,  export: true  },
  staff:         { whatsapp: true,  clients: false, export: false },
  family_member: { whatsapp: true,  clients: false, export: false },
  viewer:        { whatsapp: false, clients: false, export: false },
}

interface Props {
  orgId: string
  plan: string
  slotsUsed: number
  slotLimit: number
  myRole: string
  currentUserId: string
  // Inline member controls
  inline?: boolean
  memberId?: string
  memberName?: string
  memberRole?: string
  memberWhatsapp?: boolean
  memberClients?: boolean
  memberExport?: boolean
  // Accountant link controls
  accountantMode?: boolean
  shareLinkId?: string
  shareLinkToken?: string
  // Pending invite controls
  pendingInviteId?: string
  pendingInviteContact?: string
  pendingInviteRole?: string
  pendingInviteIsEmail?: boolean
}

export function TeamActions({
  orgId, plan, slotsUsed, slotLimit, myRole, currentUserId,
  inline, memberId, memberName, memberRole, memberWhatsapp, memberClients, memberExport,
  accountantMode, shareLinkId, shareLinkToken,
  pendingInviteId, pendingInviteContact, pendingInviteRole, pendingInviteIsEmail,
}: Props) {
  const router = useRouter()
  const [showInvite, setShowInvite] = useState(false)
  const [showPerms, setShowPerms] = useState(false)
  const [loading, setLoading] = useState(false)

  // Invite form state
  const [tab, setTab] = useState<'phone' | 'email'>('phone')
  const [inviteContact, setInviteContact] = useState('')
  const [inviteRole, setInviteRole] = useState('staff')
  const [canWhatsapp, setCanWhatsapp] = useState(ROLE_DEFAULTS.staff.whatsapp)
  const [canClients, setCanClients] = useState(ROLE_DEFAULTS.staff.clients)
  const [canExport, setCanExport] = useState(ROLE_DEFAULTS.staff.export)

  function handleRoleChange(newRole: string) {
    setInviteRole(newRole)
    const defaults = ROLE_DEFAULTS[newRole] ?? ROLE_DEFAULTS.staff
    setCanWhatsapp(defaults.whatsapp)
    setCanClients(defaults.clients)
    setCanExport(defaults.export)
  }

  async function sendInvite() {
    if (!inviteContact.trim()) { toast.error('Enter a phone number or email'); return }
    if (slotLimit > 0 && slotsUsed >= slotLimit) {
      toast.error('Team slot limit reached — upgrade your plan to add more members')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId, contact: inviteContact.trim(), contactType: tab,
          role: inviteRole, canWhatsapp, canClients, canExport,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      toast.success('Invite sent!')
      setShowInvite(false)
      setInviteContact('')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function updatePermissions(field: 'whatsapp_active' | 'can_see_clients' | 'can_see_income' | 'can_export', value: boolean) {
    const res = await fetch('/api/team/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, field, value }),
    })
    if (!res.ok) {
      toast.error('Failed to update permission')
    } else {
      router.refresh()
    }
  }

  async function removeMember() {
    if (!confirm(`Remove ${memberName} from the team? This action is logged but reversible.`)) return
    setLoading(true)
    const res = await fetch('/api/team/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    })
    if (!res.ok) toast.error('Failed to remove member')
    else { toast.success(`${memberName} removed`); router.refresh() }
    setLoading(false)
  }

  async function cancelInvite() {
    if (!confirm(`Cancel invite for ${pendingInviteContact}?`)) return
    const res = await fetch('/api/team/cancel-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId: pendingInviteId }),
    })
    if (!res.ok) toast.error('Failed to cancel invite')
    else { toast.success('Invite cancelled'); router.refresh() }
  }

  async function resendInvite() {
    const res = await fetch('/api/team/resend-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId: pendingInviteId }),
    })
    if (!res.ok) toast.error('Failed to resend invite')
    else toast.success('Invite resent')
  }

  async function generateShareLink() {
    setLoading(true)
    const res = await fetch('/api/share-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'read' }),
    })
    if (!res.ok) toast.error('Failed to generate link')
    else { toast.success('Share link generated'); router.refresh() }
    setLoading(false)
  }

  async function revokeShareLink() {
    if (!confirm('Revoke this share link?')) return
    const res = await fetch(`/api/share-link?id=${shareLinkId}`, { method: 'DELETE' })
    if (!res.ok) toast.error('Failed to revoke')
    else { toast.success('Link revoked'); router.refresh() }
  }

  async function copyShareLink() {
    if (!shareLinkToken) return
    await navigator.clipboard.writeText(`${window.location.origin}/accountant/${shareLinkToken}`)
    toast.success('Link copied!')
  }

  // ── Accountant mode ──────────────────────────────────────────────────────
  if (accountantMode) {
    if (!shareLinkId) {
      return (
        <button
          onClick={generateShareLink}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
        >
          {loading ? 'Generating…' : '+ Generate Link'}
        </button>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <button onClick={copyShareLink} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Copy link">
          <Copy size={14} />
        </button>
        <button onClick={revokeShareLink} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Revoke">
          <Trash2 size={14} />
        </button>
      </div>
    )
  }

  // ── Pending invite mode ───────────────────────────────────────────────────
  if (pendingInviteId) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={resendInvite} className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
          Resend
        </button>
        <button onClick={cancelInvite} className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
          Cancel
        </button>
      </div>
    )
  }

  // ── Inline member edit mode ───────────────────────────────────────────────
  if (inline && memberId) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {showPerms ? (
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1 cursor-pointer text-gray-600">
              <input type="checkbox" defaultChecked={memberWhatsapp}
                onChange={e => updatePermissions('whatsapp_active', e.target.checked)}
                className="rounded" />
              WhatsApp
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-gray-600">
              <input type="checkbox" defaultChecked={memberClients}
                onChange={e => updatePermissions('can_see_clients', e.target.checked)}
                className="rounded" />
              Clients
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-gray-600">
              <input type="checkbox" defaultChecked={memberExport}
                onChange={e => updatePermissions('can_export', e.target.checked)}
                className="rounded" />
              Export
            </label>
            <button onClick={() => setShowPerms(false)} className="text-gray-400 hover:text-gray-600 ml-1">
              Done
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowPerms(true)}
              className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Edit permissions
            </button>
            <button
              onClick={removeMember}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </>
        )}
      </div>
    )
  }

  // ── Top-level: Invite button + modal ─────────────────────────────────────
  const atLimit = slotLimit > 0 && slotsUsed >= slotLimit

  return (
    <>
      <button
        onClick={() => {
          if (atLimit) {
            toast.error('Team slot limit reached. Upgrade your plan to invite more people.')
            return
          }
          setShowInvite(true)
        }}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#6C63FF] text-white hover:bg-[#6C63FF] transition-colors"
      >
        + Invite
      </button>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Invite a team member</h2>
              <p className="text-xs text-gray-500 mt-0.5">{slotsUsed} of {slotLimit === 999 ? '∞' : slotLimit} slots used</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Tab switcher */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {(['phone', 'email'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setInviteContact('') }}
                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'phone' ? '📱 Phone' : '📧 Email'}
                  </button>
                ))}
              </div>

              {/* Contact input */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  {tab === 'phone' ? 'WhatsApp phone number' : 'Email address'}
                </label>
                <input
                  type={tab === 'phone' ? 'tel' : 'email'}
                  value={inviteContact}
                  onChange={e => setInviteContact(e.target.value)}
                  placeholder={tab === 'phone' ? '+2348012345678' : 'colleague@email.com'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => handleRoleChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Permission toggles */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">Permissions</label>
                <div className="space-y-2">
                  {[
                    { label: 'WhatsApp access', desc: 'Can message the TrueFlow bot', value: canWhatsapp, set: setCanWhatsapp },
                    { label: 'Client visibility', desc: 'Can see client folders and income', value: canClients, set: setCanClients },
                    { label: 'Export access', desc: 'Can download reports and exports', value: canExport, set: setCanExport },
                  ].map(({ label, desc, value, set }) => (
                    <div key={label} className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm text-gray-800">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                      <button
                        onClick={() => set(!value)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          value ? 'bg-[#6C63FF]' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                          value ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                onClick={sendInvite}
                disabled={loading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#6C63FF] text-white hover:bg-[#6C63FF] transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Invite'}
              </button>
              <button
                onClick={() => { setShowInvite(false); setInviteContact('') }}
                className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 transition-colors"
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
