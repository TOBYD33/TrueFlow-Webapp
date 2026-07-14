'use client'
// components/shared/AppSidebar.tsx
// The app-wide collapsible sidebar, promoted from the approved
// /dashboard-concept design. Desktop: 72px icon rail <-> 248px labeled rail
// with animated width. Mobile: slide-in drawer (expanded style). Includes
// the Current Plan card at the bottom. Theme-aware via useTheme().

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
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
  Package,
  Landmark,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react'
import { useTheme, tone, BRAND } from './theme'

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/whatsapp', label: 'True Assistant', icon: Sparkles },
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

const PLAN_INFO: Record<string, { label: string; desc: string }> = {
  free:        { label: 'Free',        desc: '10 receipts/mo · 1 user' },
  individual:  { label: 'Individual',  desc: 'Unlimited receipts · 1 user' },
  family:      { label: 'Family',      desc: 'Unlimited receipts · 6 members' },
  freelancer:  { label: 'Freelancer',  desc: 'Unlimited receipts · 10 clients' },
  sme_starter: { label: 'SME Starter', desc: 'Unlimited receipts · 5 staff · accountant sharing' },
  agency:      { label: 'Agency',      desc: 'Unlimited receipts · 50 clients · 3 staff' },
  sme_pro:     { label: 'SME Pro',     desc: 'Unlimited receipts · 15 staff · advanced analytics' },
  studio:      { label: 'Studio',      desc: 'Unlimited everything · 10 staff' },
  enterprise:  { label: 'Enterprise',  desc: 'Custom limits · unlimited everything' },
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') {
    // Avoid Settings matching /settings/team (which has its own item)
    return pathname === '/settings' || (pathname.startsWith('/settings/') && !pathname.startsWith('/settings/team'))
  }
  return pathname === href || pathname.startsWith(href + '/')
}

function PlanCard({ plan, expanded }: { plan: string; expanded: boolean }) {
  const { dark } = useTheme()
  const t = tone(dark)
  const info = PLAN_INFO[plan] ?? { label: plan, desc: '' }
  if (!expanded) {
    return (
      <div
        title={`Current plan: ${info.label} · Active`}
        className="w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center text-sm font-bold"
        style={{
          background: dark ? 'rgba(108,99,255,0.10)' : 'rgba(108,99,255,0.06)',
          borderColor: dark ? 'rgba(108,99,255,0.25)' : 'rgba(108,99,255,0.18)',
          color: BRAND.violet,
        }}
      >
        {info.label.charAt(0)}
      </div>
    )
  }
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{
        background: dark ? 'rgba(108,99,255,0.08)' : 'rgba(108,99,255,0.05)',
        borderColor: dark ? 'rgba(108,99,255,0.25)' : 'rgba(108,99,255,0.18)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: BRAND.violet }}>
          Current Plan
        </span>
        <span className="text-xs font-semibold" style={{ color: BRAND.violet }}>Active</span>
      </div>
      <p className="text-lg font-bold mt-1" style={{ color: t.text }}>{info.label}</p>
      {info.desc && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: t.textDim }}>{info.desc}</p>
      )}
    </div>
  )
}

function NavLinks({ expanded, onNavigate }: { expanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { dark } = useTheme()
  const t = tone(dark)
  return (
    <nav className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-4">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            title={label}
            onClick={onNavigate}
            className="flex items-center h-10 rounded-xl transition-colors shrink-0"
            style={active ? { background: BRAND.violet, color: '#FFFFFF' } : { color: t.textDim }}
          >
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
  )
}

interface AppSidebarProps {
  plan: string
  // Mobile drawer state, controlled by AppShell's hamburger
  mobileOpen: boolean
  onMobileClose: () => void
}

export function AppSidebar({ plan, mobileOpen, onMobileClose }: AppSidebarProps) {
  const { dark } = useTheme()
  const t = tone(dark)
  // Desktop collapse state — session-only, collapsed rail by default
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Desktop: collapsible rail in normal flex flow */}
      <aside
        className="relative hidden md:flex sticky top-16 h-[calc(100vh-4rem)] flex-col justify-between py-4 border-r transition-[width] duration-300 ease-in-out"
        style={{ width: expanded ? 248 : 72, background: t.chrome, borderColor: t.border }}
      >
        <button
          onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute -right-3 top-2 z-10 w-6 h-6 rounded-full border flex items-center justify-center"
          style={{ background: t.chrome, borderColor: t.border, color: t.textDim }}
        >
          {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <NavLinks expanded={expanded} />

        <div className="px-3 pt-3 shrink-0">
          <PlanCard plan={plan} expanded={expanded} />
        </div>
      </aside>

      {/* Mobile: slide-in drawer, always expanded style */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside
            className="absolute inset-y-0 left-0 w-[270px] flex flex-col justify-between py-4 border-r"
            style={{ background: t.chrome, borderColor: t.border }}
          >
            <div>
              <div className="flex items-center justify-between px-4 pb-3">
                <span className="font-bold text-lg" style={{ color: t.text }}>TrueFlow</span>
                <button
                  onClick={onMobileClose}
                  aria-label="Close menu"
                  className="p-1.5 rounded-lg"
                  style={{ color: t.textDim }}
                >
                  <X size={18} />
                </button>
              </div>
              <NavLinks expanded onNavigate={onMobileClose} />
            </div>
            <div className="px-3 pt-3 shrink-0">
              <PlanCard plan={plan} expanded />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
