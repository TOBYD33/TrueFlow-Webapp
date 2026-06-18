'use client'
// projects/page.tsx
// All projects across clients — status, deadline, fee, balance due

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Project } from '@/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, FolderOpen } from 'lucide-react'

const STATUS_OPTIONS = ['all', 'in_progress', 'delivered', 'completed', 'on_hold', 'cancelled'] as const
type StatusFilter = typeof STATUS_OPTIONS[number]

const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  delivered: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
}

type ProjectWithClient = Project & { clients: { name: string } | null }

export default function ProjectsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) { setLoading(false); return }

      const { data } = await supabase
        .from('projects')
        .select('*, clients(name)')
        .eq('org_id', member.org_id)
        .order('created_at', { ascending: false })

      setProjects((data as unknown as ProjectWithClient[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = projects.filter(p => {
    const matchesStatus = status === 'all' || p.status === status
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.clients?.name ?? '').toLowerCase().includes(search.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const totalFee = projects.reduce((s, p) => s + Number(p.total_fee ?? 0), 0)
  const totalReceived = projects.reduce((s, p) => s + Number(p.amount_received ?? 0), 0)
  const totalBalance = totalFee - totalReceived
  const activeCount = projects.filter(p => p.status === 'in_progress').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <p className="text-sm text-gray-500 mt-0.5">{projects.length} total · {activeCount} in progress</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Fee', value: formatCurrency(totalFee), color: 'text-gray-900' },
          { label: 'Received', value: formatCurrency(totalReceived), color: 'text-emerald-600' },
          { label: 'Balance Due', value: formatCurrency(totalBalance), color: 'text-orange-500' },
          { label: 'In Progress', value: String(activeCount), color: 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + table */}
      <Card>
        <CardHeader>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search projects or clients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={v => v && setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <FolderOpen size={32} className="text-gray-300" />
              {search || status !== 'all' ? 'No projects match your filters' : 'No projects yet — add a project from a client\'s page'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Project</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Deadline</th>
                    <th className="px-4 py-3 text-right">Total Fee</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(p => {
                    const balance = Number(p.total_fee ?? 0) - Number(p.amount_received ?? 0)
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/projects/${p.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-gray-500">{p.clients?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={STATUS_COLORS[p.status] ?? ''}>
                            {p.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {p.deadline ? formatDate(p.deadline) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">{p.total_fee ? formatCurrency(p.total_fee) : '—'}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(p.amount_received)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${balance > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                          {formatCurrency(balance)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
