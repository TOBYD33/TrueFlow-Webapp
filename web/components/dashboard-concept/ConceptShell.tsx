'use client'
// components/dashboard-concept/ConceptShell.tsx
// Page chrome for the concept dashboard: minimal icon-rail sidebar (like the
// Phantom/Prismify references), top bar with search + export, and the
// light/dark toggle stacked at the bottom of the rail.
// Scoped to /dashboard-concept only — the live Sidebar/AppShell are untouched.

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
} from 'lucide-react'
import { useConcept } from './ConceptProvider'

// Same destinations as the live sidebar, restyled as an icon rail
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

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ background: dark ? '#0A0A0F' : '#F5F5F7' }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 h-16 border-b transition-colors duration-300"
        style={{
          background: dark ? '#0A0A0F' : '#FFFFFF',
          borderColor: dark ? 'rgba(245,245,247,0.08)' : 'rgba(10,10,15,0.06)',
        }}
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
            style={{
              borderColor: dark ? 'rgba(245,245,247,0.14)' : 'rgba(10,10,15,0.10)',
              color: dark ? '#F5F5F7' : '#0A0A0F',
            }}
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
        {/* Icon rail sidebar */}
        <aside
          className="hidden md:flex sticky top-16 h-[calc(100vh-4rem)] w-[72px] flex-col items-center justify-between py-4 border-r transition-colors duration-300"
          style={{
            background: dark ? '#0A0A0F' : '#FFFFFF',
            borderColor: dark ? 'rgba(245,245,247,0.08)' : 'rgba(10,10,15,0.06)',
          }}
        >
          <nav className="flex flex-col items-center gap-1 overflow-y-auto">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === '/dashboard-concept'
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                  style={
                    active
                      ? { background: '#6C63FF', color: '#FFFFFF' }
                      : { color: dark ? 'rgba(245,245,247,0.45)' : 'rgba(10,10,15,0.40)' }
                  }
                >
                  <Icon size={18} />
                </Link>
              )
            })}
          </nav>

          {/* Light/dark toggle — stacked, bottom of rail, like the references */}
          <div
            className="flex flex-col gap-1 p-1 rounded-xl border"
            style={{ borderColor: dark ? 'rgba(245,245,247,0.12)' : 'rgba(10,10,15,0.08)' }}
          >
            <button
              onClick={() => setDark(true)}
              aria-label="Dark mode"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
              style={
                dark
                  ? { background: 'rgba(108,99,255,0.22)', color: '#6C63FF' }
                  : { color: 'rgba(10,10,15,0.35)' }
              }
            >
              <Moon size={16} />
            </button>
            <button
              onClick={() => setDark(false)}
              aria-label="Light mode"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
              style={
                !dark
                  ? { background: 'rgba(108,99,255,0.10)', color: '#6C63FF' }
                  : { color: 'rgba(245,245,247,0.40)' }
              }
            >
              <Sun size={16} />
            </button>
          </div>
        </aside>

        {/* Main content */}
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
