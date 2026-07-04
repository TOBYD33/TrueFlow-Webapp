// invite/accept/[token]/page.tsx
// Public page — validates invite token, shows org/role details, lets user accept.
// If not logged in, redirects to /login with the token in ?redirect= param.
// After login, the accept API links the authenticated user to the org.

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { AcceptInviteButton } from './AcceptInviteButton'
import { formatDate } from '@/lib/utils'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', staff: 'Staff',
  family_member: 'Family Member', viewer: 'Viewer',
}

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = getAdmin()

  // Look up the invite
  const { data: invite } = await admin
    .from('org_members')
    .select('id, role, org_id, invite_expires_at, invited_email, whatsapp_number, user_id, organizations(name)')
    .eq('invite_token', token)
    .is('removed_at', null)
    .single()

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Invite not found</h1>
          <p className="text-sm text-gray-500">This invite link is invalid or has already been used.</p>
          <Link href="/login" className="mt-6 inline-block text-sm text-violet-600 hover:underline">
            Sign in to TrueFlow →
          </Link>
        </div>
      </div>
    )
  }

  // Check expiry
  if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">⏰</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Invite expired</h1>
          <p className="text-sm text-gray-500">
            This link expired on {formatDate(invite.invite_expires_at)}.
            Ask your account owner to send a new one.
          </p>
        </div>
      </div>
    )
  }

  // Already accepted
  if (invite.user_id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Already accepted</h1>
          <p className="text-sm text-gray-500">This invite has already been used.</p>
          <Link href="/dashboard" className="mt-6 inline-block px-6 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Check if caller is logged in
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const orgName = (invite.organizations as any)?.name ?? 'a workspace'
  const roleLabel = ROLE_LABELS[invite.role] ?? invite.role
  const acceptUrl = `/api/team/accept-invite?token=${token}`
  const loginUrl = `/login?redirect=${encodeURIComponent(`/invite/accept/${token}`)}`

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-3">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <p className="text-xs text-gray-400 tracking-wide uppercase">TrueFlow</p>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-gray-900">You're invited!</h1>
          <p className="text-sm text-gray-500 mt-2">
            Join <strong className="text-gray-800">{orgName}</strong> as a{' '}
            <strong className="text-violet-600">{roleLabel}</strong>
          </p>
        </div>

        {user ? (
          <AcceptInviteButton token={token} userId={user.id} userEmail={user.email ?? ''} />
        ) : (
          <div className="space-y-3">
            <Link
              href={loginUrl}
              className="block w-full text-center py-3 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              Sign in to accept
            </Link>
            <p className="text-xs text-gray-400 text-center">
              Don&apos;t have an account? Sign up at{' '}
              <Link href="/login" className="text-violet-600 hover:underline">gettrueflow.com</Link>
            </p>
          </div>
        )}

        {invite.invite_expires_at && (
          <p className="text-xs text-gray-400 text-center mt-4">
            Expires {formatDate(invite.invite_expires_at)}
          </p>
        )}
      </div>
    </div>
  )
}
