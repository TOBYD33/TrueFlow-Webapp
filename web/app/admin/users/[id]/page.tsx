// app/admin/users/[id]/page.tsx
// Full user detail view with suspend/reactivate, change plan, and audit history.

import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { AdminUserActions } from './AdminUserActions'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-gray-800 last:border-0">
      <span className="w-36 shrink-0 text-xs text-gray-500 uppercase tracking-wide mt-0.5">{label}</span>
      <span className="text-sm text-gray-200">{value ?? <span className="text-gray-600">—</span>}</span>
    </div>
  )
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ org?: string }>
}) {
  const { id } = await params
  const { org: orgIdParam } = await searchParams
  const admin = getAdmin()

  // Fetch profile
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (!profile) redirect('/admin/users')

  // Find their org membership
  const { data: memberships } = await admin
    .from('org_members')
    .select('org_id, role, joined_at, whatsapp_number, organizations(id, name, plan, status, type, currency, created_at, receipt_limit, client_limit)')
    .eq('user_id', id)

  // Use the org from ?org= param if provided, else first org
  const activeMembership = orgIdParam
    ? memberships?.find((m: any) => m.org_id === orgIdParam) ?? memberships?.[0]
    : memberships?.[0]
  const org = (activeMembership as any)?.organizations ?? null

  // Receipt count
  let receiptCount = 0
  let clientCount = 0
  if (org?.id) {
    const [{ count: rc }, { count: cc }] = await Promise.all([
      admin.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
      admin.from('clients').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
    ])
    receiptCount = rc ?? 0
    clientCount = cc ?? 0
  }

  // Recent audit log entries for this user/org
  const { data: auditEntries } = await admin
    .from('admin_audit_log')
    .select('*, admin:profiles!admin_id(full_name)')
    .or(`target_id.eq.${id},target_id.eq.${org?.id ?? '00000000-0000-0000-0000-000000000000'}`)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/users" className="hover:text-gray-300 transition-colors">Users</Link>
        <span>→</span>
        <span className="text-gray-300">{profile.full_name ?? profile.id}</span>
      </div>

      {/* Profile card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Profile</h2>
          <span className="text-xs text-gray-600 font-mono">{id}</span>
        </div>
        <div className="px-5 py-2">
          <Row label="Name" value={profile.full_name} />
          <Row label="Phone" value={profile.phone ? <span className="font-mono">{profile.phone}</span> : null} />
          <Row label="Signed up" value={profile.created_at ? formatDate(profile.created_at) : null} />
          <Row label="Super admin" value={profile.is_super_admin ? <span className="text-violet-400 font-semibold">Yes</span> : 'No'} />
        </div>
      </div>

      {/* Organisation card */}
      {org ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Organisation</h2>
            <span className="text-xs text-gray-600 font-mono">{org.id}</span>
          </div>
          <div className="px-5 py-2">
            <Row label="Name" value={org.name} />
            <Row label="Type" value={org.type} />
            <Row label="Plan" value={
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                org.plan === 'free' ? 'bg-gray-700 text-gray-300' : 'bg-violet-900/60 text-violet-300'
              }`}>{org.plan}</span>
            } />
            <Row label="Status" value={
              org.status === 'suspended'
                ? <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900/50 text-red-400">suspended</span>
                : <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-400">active</span>
            } />
            <Row label="Currency" value={org.currency} />
            <Row label="Role in org" value={(activeMembership as any)?.role} />
            <Row label="WhatsApp" value={(activeMembership as any)?.whatsapp_number ? <span className="font-mono">{(activeMembership as any)?.whatsapp_number}</span> : null} />
            <Row label="Receipt limit" value={org.receipt_limit === -1 ? 'Unlimited' : org.receipt_limit} />
            <Row label="Client limit" value={org.client_limit === -1 ? 'Unlimited' : org.client_limit} />
            <Row label="Receipts scanned" value={<span className="font-semibold text-white">{receiptCount}</span>} />
            <Row label="Clients" value={<span className="font-semibold text-white">{clientCount}</span>} />
            <Row label="Org created" value={org.created_at ? formatDate(org.created_at) : null} />
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <p className="text-sm text-gray-500">No organisation found for this user.</p>
        </div>
      )}

      {/* Action buttons — client component */}
      {org && (
        <AdminUserActions
          orgId={org.id}
          orgName={org.name}
          currentStatus={org.status ?? 'active'}
          currentPlan={org.plan}
        />
      )}

      {/* Audit history for this user */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Admin Actions on this Account</h2>
        </div>
        {!auditEntries?.length ? (
          <p className="px-5 py-4 text-sm text-gray-600">No admin actions recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Details</th>
                <th className="px-4 py-3 text-left">By</th>
                <th className="px-4 py-3 text-left">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {auditEntries.map((entry: any) => (
                <tr key={entry.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-violet-300">{entry.action}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-xs">
                    {entry.details ? (
                      <span className="font-mono">{JSON.stringify(entry.details)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{entry.admin?.full_name ?? 'Admin'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(entry.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
