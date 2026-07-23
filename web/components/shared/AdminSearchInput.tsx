'use client'
// components/shared/AdminSearchInput.tsx
// Search box for admin list pages (Server Components) that updates the `q`
// query param via client-side navigation instead of a plain <form
// method="GET">. A native form submit is a real browser navigation that
// remounts the whole client tree — including ThemeProvider — so searching
// while in dark mode silently reverted the page back to light. Using
// router.push keeps everything (including the theme) exactly as it was;
// only the server-rendered results below refresh.

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export function AdminSearchInput({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const [, startTransition] = useTransition()

  function updateQuery(q: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (q) params.set('q', q)
    else params.delete('q')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <input
      value={value}
      onChange={e => {
        setValue(e.target.value)
        updateQuery(e.target.value)
      }}
      placeholder={placeholder}
      className="w-full sm:w-80 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
    />
  )
}
