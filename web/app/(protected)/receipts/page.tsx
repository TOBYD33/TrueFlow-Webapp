'use client'
// receipts/page.tsx
// Receipt list with search, filters, upload, and TanStack Table

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Receipt } from '@/types'
import { ReceiptUpload } from '@/components/ReceiptUpload'
import { ChannelBadge } from '@/components/ChannelBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, CATEGORIES, CATEGORY_COLORS } from '@/lib/utils'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ReceiptsPage() {
  const supabase = createClient()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [globalFilter, setGlobalFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return
      setOrgId(member.org_id)

      const { data } = await supabase
        .from('receipts')
        .select('*')
        .eq('org_id', member.org_id)
        .order('date', { ascending: false })

      setReceipts((data as Receipt[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return receipts.filter(r => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false
      if (channelFilter !== 'all' && r.uploaded_via !== channelFilter) return false
      if (globalFilter) {
        const q = globalFilter.toLowerCase()
        return (r.vendor_name ?? '').toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
      }
      return true
    })
  }, [receipts, categoryFilter, channelFilter, globalFilter])

  const columns = useMemo<ColumnDef<Receipt>[]>(() => [
    {
      accessorKey: 'date',
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
          Date <ArrowUpDown size={14} />
        </button>
      ),
      cell: ({ getValue }) => <span className="text-gray-500">{formatDate(getValue<string>())}</span>,
    },
    {
      accessorKey: 'vendor_name',
      header: 'Vendor',
      cell: ({ getValue }) => <span className="font-medium">{getValue<string>() ?? '—'}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ getValue }) => {
        const cat = getValue<string>()
        return (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: CATEGORY_COLORS[cat] ?? '#6b7280' }} />
            {cat}
          </span>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <button className="flex items-center gap-1 ml-auto" onClick={() => column.toggleSorting()}>
          Amount <ArrowUpDown size={14} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-semibold text-right block">{formatCurrency(row.original.amount, row.original.currency)}</span>
      ),
    },
    {
      accessorKey: 'uploaded_via',
      header: 'Channel',
      cell: ({ getValue }) => <ChannelBadge channel={getValue<'whatsapp' | 'app' | 'web'>()} />,
    },
    {
      id: 'confidence',
      header: 'AI',
      cell: ({ row }) => {
        const conf = row.original.ai_confidence
        if (!conf) return null
        const color = conf === 'high' ? 'bg-green-100 text-green-700' : conf === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
        return <Badge variant="outline" className={color}>{conf}</Badge>
      },
    },
  ], [])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
        <p className="text-sm text-gray-500 mt-0.5">{receipts.length} total receipts</p>
      </div>

      {orgId && <ReceiptUpload orgId={orgId} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Search vendor or category…"
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              className="max-w-xs"
            />
            <Select value={categoryFilter} onValueChange={v => v && setCategoryFilter(v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={v => v && setChannelFilter(v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="app">Mobile App</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading receipts…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    {table.getHeaderGroups().map(hg => (
                      <tr key={hg.id}>
                        {hg.headers.map(h => (
                          <th key={h.id} className="px-4 py-3 text-left">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {table.getRowModel().rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {table.getRowModel().rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          No receipts match your filters
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  {filtered.length} receipts · Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
