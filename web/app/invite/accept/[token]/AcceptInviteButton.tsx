'use client'
// AcceptInviteButton.tsx
// Client component that calls /api/team/accept-invite when user is already logged in.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  token: string
  userId: string
  userEmail: string
}

export function AcceptInviteButton({ token, userId, userEmail }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/team/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to accept invite')
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 text-center">
        Signing in as <strong className="text-gray-700">{userEmail}</strong>
      </p>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <button
        onClick={handleAccept}
        disabled={loading}
        className="block w-full text-center py-3 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
      >
        {loading ? 'Accepting…' : 'Accept Invitation'}
      </button>
    </div>
  )
}
