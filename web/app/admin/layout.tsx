// app/admin/layout.tsx
// Platform admin gate — redirects if no admin_role (falls back to is_super_admin for compat).
// Super Admin gets /admin/team in nav; all other admin roles do not.
// ImpersonationBanner shown if impersonation cookie is active.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { BarChart3, Users, ScrollText, Shield, UserCog } from 'lucide-react'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ROLE_LABELS: Record<string, string> = {
  super: 'Super Admin',
  support: 'Support Admin',
  finance: 'Finance Admin',
  readonly: 'Read Only Admin',
}

const BASE_NAV = [
  { href: '/admin/stats',     label: 'Stats',     Icon: BarChart3  },
  { href: '/admin/users',     label: 'Users',     Icon: Users      },
  { href: '/admin/audit-log', label: 'Audit Log', Icon: ScrollText },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('admin_role, is_super_admin, full_name')
    .eq('id', user.id)
    .single()

  // Accept admin_role column or legacy is_super_admin boolean
  const adminRole = profile?.admin_role ?? (profile?.is_super_admin ? 'super' : null)
  if (!adminRole) redirect('/dashboard')

  const isSuperAdmin = adminRole === 'super'
  const NAV = isSuperAdmin
    ? [...BASE_NAV, { href: '/admin/team', label: 'Admin Team', Icon: UserCog }]
    : BASE_NAV

  // Check for active impersonation session
  const cookieStore = await cookies()
  const impersonationSessionId = cookieStore.get('impersonation_session_id')?.value
  let impersonationUserName: string | null = null

  if (impersonationSessionId) {
    const { data: imp } = await admin
      .from('impersonation_sessions')
      .select('target_user_id, target:profiles!target_user_id(full_name)')
      .eq('id', impersonationSessionId)
      .eq('is_active', true)
      .single()
    impersonationUserName = (imp as any)?.target?.full_name ?? 'Unknown user'
  }

  return (
    <>
      {impersonationSessionId && impersonationUserName && (
        <ImpersonationBanner
          userName={impersonationUserName}
          sessionId={impersonationSessionId}
        />
      )}
      <div
        className="flex min-h-screen bg-gray-950 text-gray-100"
        style={impersonationSessionId ? { paddingTop: '44px' } : undefined}
      >
        {/* Sidebar */}
        <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="px-4 py-5 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-violet-400" />
              <span className="text-sm font-bold text-white tracking-wide">TrueFlow Admin</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{profile?.full_name ?? user.email}</p>
            <p className="text-xs text-violet-400 mt-0.5 font-medium">
              {ROLE_LABELS[adminRole] ?? adminRole}
            </p>
          </div>
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {NAV.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-gray-800">
            <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ← Back to app
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </>
  )
}
