// app/admin/audit-log/page.tsx
// Searchable list of all admin_audit_log entries, newest first.

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { AdminSearchInput } from '@/components/shared/AdminSearchInput'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ACTION_COLOURS: Record<string, string> = {
  suspend_org:    'bg-red-900/50 text-red-400',
  reactivate_org: 'bg-emerald-900/40 text-emerald-400',
  change_plan:    'bg-violet-900/50 text-violet-300',
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string }>
}) {
  const { q, action } = await searchParams
  const admin = getAdmin()

  let query = admin
    .from('admin_audit_log')
    .select('*, admin:profiles!admin_id(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (action) query = query.eq('action', action)

  const { data: entries, error } = await query

  const filtered = q && entries
    ? entries.filter((e: any) =>
        e.action?.includes(q.toLowerCase()) ||
        JSON.stringify(e.details ?? {}).toLowerCase().includes(q.toLowerCase()) ||
        e.admin?.full_name?.toLowerCase().includes(q.toLowerCase())
      )
    : entries ?? []

  const uniqueActions = [...new Set((entries ?? []).map((e: any) => e.action as string))]

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">{filtered.length} entries</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <AdminSearchInput placeholder="Search actions or details…" />
        <div className="flex gap-1.5 flex-wrap">
          <Link
            href="/admin/audit-log"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!action ? 'bg-violet-900/60 text-violet-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            All
          </Link>
          {uniqueActions.map(a => (
            <Link
              key={a}
              href={`/admin/audit-log?action=${a}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${action === a ? 'bg-violet-900/60 text-violet-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {a}
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error.message}</p>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Details</th>
                <th className="px-4 py-3 text-left">By</th>
                <th className="px-4 py-3 text-left">Target ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-600">No audit entries found</td>
                </tr>
              )}
              {filtered.map((entry: any) => (
                <tr key={entry.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold font-mono ${ACTION_COLOURS[entry.action] ?? 'bg-gray-700 text-gray-300'}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-xs">
                    {entry.details ? (
                      <div className="space-y-0.5">
                        {Object.entries(entry.details as Record<string, unknown>).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-gray-600">{k}: </span>
                            <span className="text-gray-300">{String(v ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{entry.admin?.full_name ?? 'Admin'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                    {entry.target_id ? entry.target_id.slice(0, 8) + '…' : '—'}
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
