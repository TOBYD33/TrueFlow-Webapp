'use client'
// components/shared/GlobalSearch.tsx
// Cross-app search in the shared header. Debounced (300ms) calls to
// /api/search, grouped results dropdown (Clients / Invoices / Receipts /
// Projects / Team), click-through to the specific record. Also feeds the
// PageTools query so page-level filters keep working while typing.

import { useState, useEffect, useRef, forwardRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { useTheme, tone, BRAND } from './theme'
import { usePageToolsHeader } from './PageTools'

interface SearchItem { id: string; label: string; sub: string; href: string }
interface SearchGroup { type: string; items: SearchItem[]; hasMore: boolean; viewAllHref: string }

export const GlobalSearch = forwardRef<HTMLInputElement>(function GlobalSearch(_props, inputRef) {
  const router = useRouter()
  const { dark } = useTheme()
  const t = tone(dark)
  const { setQuery } = usePageToolsHeader()

  const [value, setValue] = useState('')
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false) // a completed search for current value
  const boxRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Debounced global search (300ms after the user stops typing)
  useEffect(() => {
    setSearched(false)
    if (value.trim().length < 2) {
      setGroups([])
      setOpen(false)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        const json = await res.json()
        setGroups(json.groups ?? [])
        setSearched(true)
        setOpen(true)
      } catch {
        // aborted or network error — keep previous state
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  // Close on click outside / Escape
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  function go(href: string) {
    setOpen(false)
    setValue('')
    setQuery('')
    router.push(href)
  }

  return (
    <div ref={boxRef} className="hidden md:block relative flex-1 max-w-md">
      <div
        className="flex items-center gap-2 rounded-xl px-3.5 h-10"
        style={{ background: dark ? 'rgba(245,245,247,0.06)' : BRAND.cloud }}
      >
        {searching
          ? <Loader2 size={15} className="animate-spin" style={{ color: t.textDim }} />
          : <Search size={15} style={{ color: t.textDim }} />}
        <input
          ref={inputRef}
          value={value}
          onChange={e => {
            setValue(e.target.value)
            setQuery(e.target.value) // keep page-level filtering working too
          }}
          onFocus={() => { if (groups.length > 0 || searched) setOpen(true) }}
          placeholder="Search clients, invoices, receipts…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: t.text }}
        />
        <span className="text-[11px] px-1.5 py-0.5 rounded border shrink-0" style={{ color: t.textDim, borderColor: t.border }}>
          ⌘ + F
        </span>
      </div>

      {/* Results dropdown */}
      {open && value.trim().length >= 2 && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl border py-2 z-50 max-h-[70vh] overflow-y-auto"
          style={{ background: t.surface, borderColor: t.border, boxShadow: '0 12px 32px rgba(10,10,15,0.18)' }}
        >
          {searched && groups.length === 0 ? (
            <p className="px-4 py-4 text-sm" style={{ color: t.textDim }}>
              No results found for &ldquo;{value.trim()}&rdquo;
            </p>
          ) : (
            groups.map(group => (
              <div key={group.type} className="mb-1">
                <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: BRAND.violet }}>
                  {group.type}
                </p>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => go(item.href)}
                    className="w-full text-left px-4 py-2 flex items-center justify-between gap-3 transition-colors"
                    style={{ color: t.text }}
                    onMouseEnter={e => (e.currentTarget.style.background = t.hover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    <span className="text-xs truncate shrink-0 capitalize" style={{ color: t.textDim }}>{item.sub}</span>
                  </button>
                ))}
                {group.hasMore && (
                  <button
                    onClick={() => go(group.viewAllHref)}
                    className="w-full text-left px-4 py-1.5 text-xs font-medium"
                    style={{ color: BRAND.violet }}
                  >
                    View all {group.type.toLowerCase()} →
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
})
