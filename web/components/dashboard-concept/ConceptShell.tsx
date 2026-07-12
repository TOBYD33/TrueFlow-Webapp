'use client'
// components/dashboard-concept/ConceptShell.tsx
// Page chrome for the concept dashboard: collapsible sidebar (icon rail ↔
// labeled rail), top bar with search + export, and the light/dark toggle at
// the bottom of the sidebar. The sidebar sits in normal flex flow, so the
// main content reflows in sync with the width transition automatically.
// Scoped to /dashboard-concept only — the live Sidebar/AppShell are untouched.

import { useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  FileText,
  Users,
  Settings,
  UserCircle2,
  FolderKanban,
  TrendingUp,
  Bell,
  PiggyBank,
  MessageSquare,
  Package,
  Landmark,
  Search,
  Download,
  Sun,
  Moon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useConcept } from './ConceptProvider'

// Same destinations as the live sidebar, restyled as a collapsible rail
const navItems = [
  { href: '/dashboard-concept', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/whatsapp', label: 'True Assistant', icon: MessageSquare },
  { href: '/receipts', label: 'Receipts', icon: Receipt },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/clients', label: 'Clients', icon: UserCircle2 },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/income', label: 'Income', icon: TrendingUp },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/tax', label: 'Tax Hub', icon: Landmark },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/settings/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function ConceptShell({ children }: { children: React.ReactNode }) {
  const { orgName, dark, setDark } = useConcept()
  // Collapsed icon rail is the default look; session-only state by design
  const [expanded, setExpanded] = useState(false)

  const border = dark ? 'rgba(245,245,247,0.08)' : 'rgba(10,10,15,0.06)'
  const surface = dark ? '#0A0A0F' : '#FFFFFF'
  const mutedIcon = dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.40)'

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ background: dark ? '#0A0A0F' : '#F5F5F7' }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 h-16 border-b transition-colors duration-300"
        style={{ background: surface, borderColor: border }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dashboard-concept/TFLogo.png"
            alt="TrueFlow logo"
            className="w-9 h-9 rounded-full object-cover"
          />
          <span className="font-bold text-lg tracking-tight" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
            TrueFlow
          </span>
          <span className="hidden sm:inline text-xs px-2 py-1 rounded-md font-medium" style={{ background: dark ? 'rgba(108,99,255,0.18)' : 'rgba(108,99,255,0.10)', color: '#6C63FF' }}>
            Concept
          </span>
        </div>

        {/* Search (visual only for the concept) */}
        <div
          className="hidden md:flex items-center gap-2 flex-1 max-w-md rounded-xl px-3.5 h-10"
          style={{ background: dark ? 'rgba(245,245,247,0.06)' : '#F5F5F7' }}
        >
          <Search size={15} style={{ color: dark ? 'rgba(245,245,247,0.4)' : 'rgba(10,10,15,0.35)' }} />
          <span className="text-sm" style={{ color: dark ? 'rgba(245,245,247,0.35)' : 'rgba(10,10,15,0.35)' }}>
            Search
          </span>
          <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded border" style={{ color: dark ? 'rgba(245,245,247,0.35)' : 'rgba(10,10,15,0.35)', borderColor: dark ? 'rgba(245,245,247,0.15)' : 'rgba(10,10,15,0.12)' }}>
            ⌘ + F
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="hidden sm:flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-medium transition-colors"
            style={{ borderColor: dark ? 'rgba(245,245,247,0.14)' : 'rgba(10,10,15,0.10)', color: dark ? '#F5F5F7' : '#0A0A0F' }}
          >
            <Download size={14} /> Export CSV
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: '#00D4AA' }}
            title={orgName}
          >
            {orgName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Collapsible sidebar — width animates, content reflows in sync */}
        <aside
          className="relative hidden md:flex sticky top-16 h-[calc(100vh-4rem)] flex-col justify-between py-4 border-r transition-[width] duration-300 ease-in-out"
          style={{ width: expanded ? 248 : 72, background: surface, borderColor: border }}
        >
          {/* Collapse/expand pill on the sidebar's right edge */}
          <button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="absolute -right-3 top-2 z-10 w-6 h-6 rounded-full border flex items-center justify-center transition-colors"
            style={{ background: surface, borderColor: border, color: mutedIcon }}
          >
            {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          <nav className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-4">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === '/dashboard-concept'
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className="flex items-center h-10 rounded-xl transition-colors shrink-0"
                  style={
                    active
                      ? { background: '#6C63FF', color: '#FFFFFF' }
                      : { color: mutedIcon }
                  }
                >
                  {/* Icon keeps a fixed horizontal position in both states */}
                  <span className="w-10 shrink-0 flex items-center justify-center">
                    <Icon size={18} />
                  </span>
                  <span
                    className="text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out"
                    style={{
                      opacity: expanded ? 1 : 0,
                      transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
                      maxWidth: expanded ? 160 : 0,
                    }}
                  >
                    {label}
                  </span>
                </Link>
              )
            })}
          </nav>

          {/* Light/dark toggle — bottom of sidebar in both states.
              Vertical stack when collapsed, horizontal pill when expanded. */}
          <div className="px-4 pt-3 shrink-0">
            <div
              className={`${expanded ? 'flex-row w-fit' : 'flex-col'} flex gap-1 p-1 rounded-xl border transition-colors`}
              style={{ borderColor: dark ? 'rgba(245,245,247,0.12)' : 'rgba(10,10,15,0.08)' }}
            >
              <button
                onClick={() => setDark(true)}
                aria-label="Dark mode"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={
                  dark
                    ? { background: 'rgba(108,99,255,0.22)', color: '#6C63FF' }
                    : { color: 'rgba(10,10,15,0.35)' }
                }
              >
                <Moon size={15} />
              </button>
              <button
                onClick={() => setDark(false)}
                aria-label="Light mode"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={
                  !dark
                    ? { background: 'rgba(108,99,255,0.10)', color: '#6C63FF' }
                    : { color: 'rgba(245,245,247,0.40)' }
                }
              >
                <Sun size={15} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main content — reflows with the sidebar because both share flex flow */}
        <main className="flex-1 min-w-0 px-5 md:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: dark ? '#F5F5F7' : '#0A0A0F' }}>
              Dashboard
            </h1>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 h-9 px-3.5 rounded-xl border text-sm font-medium"
                style={{ borderColor: dark ? 'rgba(245,245,247,0.14)' : 'rgba(10,10,15,0.10)', color: dark ? 'rgba(245,245,247,0.75)' : 'rgba(10,10,15,0.65)' }}
              >
                <CalendarDays size={14} /> Date Range
              </button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
