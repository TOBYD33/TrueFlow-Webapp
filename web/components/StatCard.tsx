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
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
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
