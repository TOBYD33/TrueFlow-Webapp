// accountant/[token]/page.tsx
// Read-only accountant portal — no login required, accessed via share link.
// Uses admin client to bypass RLS after validating the token.

import { createClient } from '@supabase/supabase-js'
import { formatCurrency, formatDate, CATEGORY_COLORS } from '@/lib/utils'
import { Receipt } from '@/types'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface ShareLink {
  id: string
  org_id: string
  permission: string
  expires_at: string | null
  organizations: { name: string; currency: string } | null
}

export default async function AccountantPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = getAdmin()

  // Validate token — admin client bypasses RLS (no user session on this route)
  const { data: link } = await supabase
    .from('share_links')
    .select('*, organizations(name, currency)')
    .eq('token', token)
    .single()

  const shareLink = link as unknown as ShareLink | null

  if (!shareLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 mb-2">Link not found</p>
          <p className="text-sm text-gray-500">This link is invalid or has been revoked.</p>
        </div>
      </div>
    )
  }

  if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 mb-2">Link expired</p>
          <p className="text-sm text-gray-500">Ask your client to generate a new accountant link from their Settings page.</p>
        </div>
      </div>
    )
  }

  const orgId = shareLink.org_id
  const orgName = shareLink.organizations?.name ?? 'Business'

  // Fetch receipts
  const { data: receipts } = await supabase
    .from('receipts')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(200)

  const allReceipts = (receipts as Receipt[]) ?? []

  // Summary stats
  const now = new Date()
  const thisMonth = allReceipts.filter(r => {
    const d = new Date(r.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const totalThisMonth = thisMonth.reduce((s, r) => s + Number(r.amount), 0)
  const totalAllTime = allReceipts.reduce((s, r) => s + Number(r.amount), 0)
  const totalTax = allReceipts.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)

  const categoryTotals = Object.entries(
    allReceipts.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {})
  ).sort(([, a], [, b]) => b - a)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-xl font-bold text-emerald-600">TrueFlow</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="font-semibold text-gray-900">{orgName}</span>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
            Read-only · Accountant View
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'This Month', value: formatCurrency(totalThisMonth), color: 'text-gray-900' },
            { label: 'All Time Spend', value: formatCurrency(totalAllTime), color: 'text-gray-900' },
            { label: 'Tax Tracked', value: formatCurrency(totalTax), color: 'text-emerald-600' },
            { label: 'Receipts', value: String(allReceipts.length), color: 'text-gray-900' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Spending by Category</h2>
          </div>
          <div className="p-5 space-y-3">
            {categoryTotals.map(([category, total]) => {
              const pct = totalAllTime ? Math.round((total / totalAllTime) * 100) : 0
              return (
                <div key={category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[category] ?? '#6b7280' }} />
                      {category}
                    </span>
                    <span className="font-semibold">{formatCurrency(total)} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CATEGORY_COLORS[category] ?? '#6b7280' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Receipt table */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">All Receipts ({allReceipts.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Vendor</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Tax</th>
                  <th className="px-4 py-3 text-left">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allReceipts.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-gray-500">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.vendor_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[r.category] ?? '#6b7280' }} />
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.tax_amount ? formatCurrency(r.tax_amount) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 capitalize">{r.uploaded_via}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Powered by TrueFlow · gettrueflow.com · This report is read-only
        </p>
      </div>
    </div>
  )
}
