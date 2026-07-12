// StatCard.tsx
// Single metric card used on the dashboard

import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  color?: string
}

export function StatCard({ label, value, sub, icon: Icon, color = 'emerald' }: StatCardProps) {
  // Brand palette only: mint for positive/inflow stats, violet for the rest,
  // amber (documented Warn colour) for outflow/warning stats.
  const colorMap: Record<string, string> = {
    emerald: 'bg-[#00D4AA]/10 text-[#00A88A]',
    blue: 'bg-[#6C63FF]/10 text-[#6C63FF]',
    purple: 'bg-[#6C63FF]/10 text-[#6C63FF]',
    orange: 'bg-[#FFB545]/15 text-[#D9932A]',
    indigo: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={cn('p-2.5 rounded-lg', colorMap[color] ?? colorMap.emerald)}>
            <Icon size={20} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
