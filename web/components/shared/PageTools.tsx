'use client'
// components/shared/PageTools.tsx
// Connects each page to the shared header's search bar and Export CSV
// button. A page calls usePageTools({ exportRows, exportName, onSearch })
// to register; the header consumes the registration. Pages that register
// nothing get a disabled Export button ("Nothing to export here yet")
// and a disabled search field.

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

type ExportRows = Record<string, unknown>[]

interface PageToolsValue {
  query: string
  setQuery: (q: string) => void
  searchEnabled: boolean
  exportEnabled: boolean
  runExport: () => void
  register: (opts: { exportRows?: () => ExportRows; exportName?: string; searchable?: boolean }) => void
  reset: () => void
}

const PageToolsContext = createContext<PageToolsValue>({
  query: '',
  setQuery: () => {},
  searchEnabled: false,
  exportEnabled: false,
  runExport: () => {},
  register: () => {},
  reset: () => {},
})

export function toCsv(rows: ExportRows): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

export function PageToolsProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState('')
  const [searchEnabled, setSearchEnabled] = useState(false)
  const [exportEnabled, setExportEnabled] = useState(false)
  const exporterRef = useRef<{ rows: () => ExportRows; name: string } | null>(null)

  const register = useCallback((opts: { exportRows?: () => ExportRows; exportName?: string; searchable?: boolean }) => {
    if (opts.exportRows) {
      exporterRef.current = { rows: opts.exportRows, name: opts.exportName ?? 'trueflow-export' }
      setExportEnabled(true)
    }
    if (opts.searchable) setSearchEnabled(true)
  }, [])

  const reset = useCallback(() => {
    exporterRef.current = null
    setExportEnabled(false)
    setSearchEnabled(false)
    setQuery('')
  }, [])

  const runExport = useCallback(() => {
    const exp = exporterRef.current
    if (!exp) return
    const csv = toCsv(exp.rows())
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exp.name}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <PageToolsContext.Provider value={{ query, setQuery, searchEnabled, exportEnabled, runExport, register, reset }}>
      {children}
    </PageToolsContext.Provider>
  )
}

export function usePageToolsHeader() {
  return useContext(PageToolsContext)
}

// Called by a page to plug into the shared header. Re-registers when the
// page's data changes; automatically unregisters on unmount/navigation.
export function usePageTools(opts: {
  exportRows?: () => ExportRows
  exportName?: string
  searchable?: boolean
}): { query: string } {
  const ctx = useContext(PageToolsContext)
  const { register, reset } = ctx
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    register({
      exportRows: optsRef.current.exportRows ? () => optsRef.current.exportRows!() : undefined,
      exportName: optsRef.current.exportName,
      searchable: optsRef.current.searchable,
    })
    return () => reset()
  }, [register, reset])

  return { query: ctx.query }
}
