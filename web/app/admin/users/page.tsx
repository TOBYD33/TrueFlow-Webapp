// app/admin/users/page.tsx
// Searchable list of all users — search by phone or org name.

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface UserRow {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  created_at: string
  org_id: string | null
  org_name: string | null
  plan: string | null
  status: string | null
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const admin = getAdmin()

  // Join profiles → org_members → organizations
  const { data: members } = await admin
    .from('org_members')
    .select(`
      user_id,
      org_id,
      profiles!inner(id, full_name, phone, created_at),
      organizations!inner(id, name, plan, status)
    `)
    .order('profiles(created_at)', { ascending: false })
    .limit(200)

  // Also get users with no org
  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, full_name, phone, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  // Get emails from auth.users via admin — use RPC or just use what we have
  const orgMemberUserIds = new Set((members ?? []).map((m: any) => m.user_id))

  // Build unified row list
  const rows: UserRow[] = (members ?? []).map((m: any) => ({
    id: m.user_id,
    full_name: m.profiles?.full_name ?? null,
    phone: m.profiles?.phone ?? null,
    email: null,
    created_at: m.profiles?.created_at ?? '',
    org_id: m.org_id,
    org_name: m.organizations?.name ?? null,
    plan: m.organizations?.plan ?? null,
    status: m.organizations?.status ?? 'active',
  }))

  // Add profiles without orgs
  for (const p of (allProfiles ?? [])) {
    if (!orgMemberUserIds.has((p as any).id)) {
      rows.push({
        id: (p as any).id,
        full_name: (p as any).full_name ?? null,
        phone: (p as any).phone ?? null,
        email: null,
        created_at: (p as any).created_at ?? '',
        org_id: null,
        org_name: null,
        plan: null,
        status: null,
      })
    }
  }

  // Client-side search filter (applied server-side here)
  const filtered = q
    ? rows.filter(r =>
        r.phone?.toLowerCase().includes(q.toLowerCase()) ||
        r.org_name?.toLowerCase().includes(q.toLowerCase()) ||
        r.full_name?.toLowerCase().includes(q.toLowerCase())
      )
    : rows

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {rows.length} total</p>
        </div>
      </div>

      {/* Search */}
      <form method="GET">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name, phone or org…"
          className="w-full sm:w-80 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 text-left">Name / Phone</th>
                <th className="px-4 py-3 text-left">Organisation</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Signed up</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-600">No users found</td>
                </tr>
              )}
              {filtered.map(user => (
                <tr key={`${user.id}-${user.org_id}`} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{user.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500 font-mono">{user.phone ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{user.org_name ?? <span className="text-gray-600">No org</span>}</td>
                  <td className="px-4 py-3">
                    {user.plan ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        user.plan === 'free' ? 'bg-gray-700 text-gray-300' : 'bg-violet-900/60 text-violet-300'
                      }`}>{user.plan}</span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {user.status === 'suspended' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900/50 text-red-400">suspended</span>
                    ) : user.status ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-400">active</span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{user.created_at ? formatDate(user.created_at) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${user.id}${user.org_id ? `?org=${user.org_id}` : ''}`}
                      className="text-xs text-violet-400 hover:text-violet-300 font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
