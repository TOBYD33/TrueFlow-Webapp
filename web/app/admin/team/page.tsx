// app/admin/team/page.tsx
// Platform admin team management — Super Admin only.
// Lists all profiles with admin_role set; allows inviting, changing role, revoking.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { formatDate } from '@/lib/utils'
import { AdminTeamActions } from './AdminTeamActions'

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

const ROLE_COLORS: Record<string, string> = {
  super: 'bg-violet-900/60 text-violet-300',
  support: 'bg-blue-900/50 text-blue-300',
  finance: 'bg-emerald-900/50 text-emerald-300',
  readonly: 'bg-gray-700 text-gray-300',
}

export default async function AdminTeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getAdmin()

  // Gate: Super Admin only
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('admin_role, is_super_admin')
    .eq('id', user.id)
    .single()

  const callerRole = callerProfile?.admin_role ?? (callerProfile?.is_super_admin ? 'super' : null)
  if (callerRole !== 'super') redirect('/admin/stats')

  // Fetch all platform admins
  const { data: admins } = await admin
    .from('profiles')
    .select('id, full_name, phone, admin_role, created_at, updated_at')
    .not('admin_role', 'is', null)
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage platform admin access — Super Admin only</p>
        </div>
        <AdminTeamActions currentUserId={user.id} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {!admins?.length ? (
          <p className="px-5 py-6 text-sm text-gray-600">No admin team members found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 text-left">Name / Phone</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Added</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {admins.map((admin: any) => (
                <tr key={admin.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{admin.full_name ?? '—'}</p>
                    {admin.phone && (
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{admin.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[admin.admin_role] ?? 'bg-gray-700 text-gray-300'}`}>
                      {ROLE_LABELS[admin.admin_role] ?? admin.admin_role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {admin.created_at ? formatDate(admin.created_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {admin.id === user.id ? (
                      <span className="text-xs text-gray-600">You</span>
                    ) : (
                      <AdminTeamActions
                        currentUserId={user.id}
                        targetId={admin.id}
                        targetName={admin.full_name ?? admin.phone ?? admin.id}
                        currentRole={admin.admin_role}
                        inline
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-600">
        Super Admin status can only be granted via direct SQL — never through this interface.
      </p>
    </div>
  )
}
