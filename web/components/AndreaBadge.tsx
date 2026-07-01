'use client'
// AndreaBadge.tsx
// Shows this org's lifetime Andrea Aid contribution on the dashboard.
// Fetches from Supabase client-side — only visible to the org itself.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Heart } from 'lucide-react'

export function AndreaBadge() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const [total, setTotal] = useState<number | null>(null)
  const [communityTotal, setCommunityTotal] = useState<number | null>(null)

  useEffect(() => {
    if (!orgId) return

    async function load() {
      const [{ data: rows }, communityRes] = await Promise.all([
        supabase.from('andrea_contributions').select('amount').eq('org_id', orgId),
        fetch('/api/andrea/total').then(r => r.json()).catch(() => ({ total: null })),
      ])
      const orgTotal = (rows ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
      setTotal(orgTotal)
      if (communityRes?.total != null) setCommunityTotal(Number(communityRes.total))
    }

    load()
  }, [orgId])

  if (total === null || total === 0) return null

  const fmt = (n: number) =>
    `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <a
      href="https://andreaaid.com/cases"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 rounded-xl border border-[#00D4AA]/30 bg-[#00D4AA]/5 px-4 py-3 hover:bg-[#00D4AA]/10 transition-colors cursor-pointer group"
    >
      <div className="mt-0.5 w-8 h-8 rounded-full bg-[#00D4AA]/20 flex items-center justify-center shrink-0">
        <Heart size={15} className="text-[#00D4AA] fill-[#00D4AA]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          You&apos;ve contributed {fmt(total)} to Andrea Aid
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          2% of every TrueFlow subscription funds life-saving medical treatments for Nigerians in need.
          {communityTotal && communityTotal > total ? (
            <> The TrueFlow community has given {fmt(communityTotal)} in total.</>
          ) : null}
          {' '}
          <span className="text-[#00D4AA] font-medium group-hover:underline">See patient cases →</span>
        </p>
      </div>
    </a>
  )
}
