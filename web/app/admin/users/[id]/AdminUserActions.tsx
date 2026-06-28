'use client'
// AdminUserActions.tsx
// Client component — renders suspend/reactivate + change plan controls.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const VALID_PLANS = [
  'free', 'individual', 'family', 'freelancer',
  'sme_starter', 'agency', 'sme_pro', 'studio', 'enterprise',
]

interface Props {
  orgId: string
  orgName: string
  currentStatus: string
  currentPlan: string
}

export function AdminUserActions({ orgId, orgName, currentStatus, currentPlan }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Plan override state
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(currentPlan)
  const [planReason, setPlanReason] = useState('')

  async function callAdmin(endpoint: string, body: Record<string, unknown>) {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      return json
    } catch (err) {
      throw err
    } finally {
      setLoading(false)
    }
  }

  async function handleSuspend() {
    const reason = prompt(`Reason for suspending "${orgName}" (optional):`)
    if (reason === null) return // cancelled
    try {
      await callAdmin('suspend', { org_id: orgId, reason })
      setSuccess(`${orgName} has been suspended.`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleReactivate() {
    if (!confirm(`Reactivate "${orgName}"?`)) return
    try {
      await callAdmin('reactivate', { org_id: orgId })
      setSuccess(`${orgName} has been reactivated.`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleChangePlan() {
    if (selectedPlan === currentPlan) {
      setError('New plan is the same as current plan.')
      return
    }
    try {
      const json = await callAdmin('change-plan', {
        org_id: orgId,
        new_plan: selectedPlan,
        reason: planReason || null,
      })
      setSuccess(`Plan changed from ${json.old_plan} → ${json.new_plan}`)
      setShowPlanForm(false)
      setPlanReason('')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const isSuspended = currentStatus === 'suspended'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Admin Actions</h2>
      </div>
      <div className="px-5 py-4 space-y-4">
        {/* Status messages */}
        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
        )}
        {success && (
          <p className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">{success}</p>
        )}

        {/* Suspend / Reactivate */}
        <div className="flex gap-3 flex-wrap">
          {!isSuspended ? (
            <button
              onClick={handleSuspend}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-900/40 text-red-400 border border-red-800 hover:bg-red-900/70 transition-colors disabled:opacity-50"
            >
              Suspend Organisation
            </button>
          ) : (
            <button
              onClick={handleReactivate}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-900/40 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/70 transition-colors disabled:opacity-50"
            >
              Reactivate Organisation
            </button>
          )}

          <button
            onClick={() => { setShowPlanForm(v => !v); setError(null); setSuccess(null) }}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-900/40 text-violet-300 border border-violet-800 hover:bg-violet-900/70 transition-colors disabled:opacity-50"
          >
            {showPlanForm ? 'Cancel' : 'Change Plan'}
          </button>
        </div>

        {/* Plan override form */}
        {showPlanForm && (
          <div className="border border-gray-700 rounded-xl p-4 space-y-3 bg-gray-800/50">
            <p className="text-xs text-gray-400">
              Current plan: <span className="font-semibold text-violet-300">{currentPlan}</span>
            </p>
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">New plan</label>
                <select
                  value={selectedPlan}
                  onChange={e => setSelectedPlan(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  {VALID_PLANS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-gray-500 mb-1.5">Reason (optional)</label>
                <input
                  type="text"
                  value={planReason}
                  onChange={e => setPlanReason(e.target.value)}
                  placeholder="e.g. Webhook fix, refund request…"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                onClick={handleChangePlan}
                disabled={loading || selectedPlan === currentPlan}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
