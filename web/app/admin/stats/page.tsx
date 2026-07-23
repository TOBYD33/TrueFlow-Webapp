// app/admin/stats/page.tsx
// Platform-wide stats dashboard for the super admin.

import { createClient } from '@supabase/supabase-js'
import { formatDate } from '@/lib/utils'
import { resolvePlan } from '@/lib/plans'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default async function AdminStatsPage() {
  const admin = getAdmin()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  const [
    { count: totalOrgs },
    { count: activeOrgs },
    { count: suspendedOrgs },
    { count: totalProfiles },
    { count: newSignups },
    { data: planBreakdown },
    { count: receiptsToday },
    { count: totalReceipts },
  ] = await Promise.all([
    admin.from('organizations').select('*', { count: 'exact', head: true }),
    admin.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    admin.from('organizations').select('plan'),
    admin.from('receipts').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    admin.from('receipts').select('*', { count: 'exact', head: true }),
  ])

  // Count paying orgs (non-free) — resolvePlan buckets any deprecated plan
  // name (e.g. 'sme_starter') the migration hasn't reached yet into its
  // current equivalent, so it's never silently dropped from this rollup.
  const planCounts: Record<string, number> = {}
  for (const org of (planBreakdown ?? [])) {
    const plan = resolvePlan((org as { plan: string }).plan)
    planCounts[plan] = (planCounts[plan] ?? 0) + 1
  }
  const payingOrgs = Object.entries(planCounts)
    .filter(([plan]) => plan !== 'free' && plan !== 'free_trial')
    .reduce((s, [, n]) => s + n, 0)

  const PLAN_ORDER = ['free', 'free_trial', 'individual', 'business', 'business_pro', 'enterprise']

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-white">Platform Stats</h1>
        <p className="text-sm text-gray-500 mt-0.5">Live data from Supabase · {formatDate(now.toISOString())}</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Organisations" value={totalOrgs ?? 0} />
        <StatCard label="Total Users" value={totalProfiles ?? 0} />
        <StatCard label="Paying Orgs" value={payingOrgs} sub="non-free plans" />
        <StatCard label="New Signups (7d)" value={newSignups ?? 0} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Orgs" value={activeOrgs ?? 0} />
        <StatCard label="Suspended Orgs" value={suspendedOrgs ?? 0} />
        <StatCard label="Receipts Today" value={receiptsToday ?? 0} />
        <StatCard label="Total Receipts" value={totalReceipts ?? 0} />
      </div>

      {/* Plan breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Orgs by Plan</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="px-5 py-3 text-left">Plan</th>
              <th className="px-5 py-3 text-right">Organisations</th>
              <th className="px-5 py-3 text-right">% of Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {PLAN_ORDER.map(plan => {
              const count = planCounts[plan] ?? 0
              if (count === 0 && plan !== 'free') return null
              const pct = totalOrgs ? ((count / totalOrgs) * 100).toFixed(1) : '0'
              return (
                <tr key={plan} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      plan === 'free' ? 'bg-gray-700 text-gray-300' : 'bg-violet-900/50 text-violet-300'
                    }`}>
                      {plan}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-white font-semibold">{count}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{pct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
