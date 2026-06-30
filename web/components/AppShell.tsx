'use client'
// AppShell.tsx
// Client wrapper that manages mobile sidebar open/close state.
// The layout is a server component so this handles all interactive state.

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Menu } from 'lucide-react'

interface AppShellProps {
  children: React.ReactNode
  orgName: string
  plan: string
}

export function AppShell({ children, orgName, plan }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors -ml-1 shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} className="text-gray-600" />
          </button>

          <h2 className="text-sm font-medium text-gray-600 truncate flex-1">{orgName}</h2>

          <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            {plan}
          </span>
        </header>

        <main className="flex-1 p-4 md:p-6 min-w-0">
          {children}
        </main>
      </div>

    </div>
  )
}
