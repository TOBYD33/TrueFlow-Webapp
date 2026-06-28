// app/admin/layout.tsx
// Server-side super-admin gate — redirects immediately if not is_super_admin.
// Uses the admin (service role) client so RLS cannot block the profiles check.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { BarChart3, Users, ScrollText, Shield } from 'lucide-react'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const NAV = [
  { href: '/admin/stats',     label: 'Stats',     Icon: BarChart3  },
  { href: '/admin/users',     label: 'Users',     Icon: Users      },
  { href: '/admin/audit-log', label: 'Audit Log', Icon: ScrollText },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Server-side is_super_admin check — cannot be bypassed client-side
  const admin = getAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_super_admin, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.is_super_admin) redirect('/dashboard')

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-violet-400" />
            <span className="text-sm font-bold text-white tracking-wide">TrueFlow Admin</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">{profile.full_name ?? user.email}</p>
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
  )
}
