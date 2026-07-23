'use client'
// components/shared/AdminBadge.tsx
// Theme-aware pill badges for the admin panel (plan / status). The legacy
// admin pages rendered these with hardcoded dark-mode Tailwind classes
// (e.g. bg-gray-700 text-gray-300) that AdminShell's transitional light-mode
// remap doesn't touch, since that remap only targets page-level surface
// classes, not one-off colored pills — so in light mode they rendered as
// low-contrast dark-on-dark. These read the real theme via useTheme() and
// pick colors that stay readable in both modes.

import { useTheme, BRAND } from './theme'

export function PlanBadge({ plan }: { plan: string }) {
  const { dark } = useTheme()
  const isFree = plan === 'free'
  const bg = isFree
    ? (dark ? 'rgba(245,245,247,0.12)' : 'rgba(10,10,15,0.07)')
    : 'rgba(108,99,255,0.14)'
  const color = isFree
    ? (dark ? BRAND.cloud : BRAND.black)
    : BRAND.violet

  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: bg, color }}
    >
      {plan}
    </span>
  )
}

export function StatusBadge({ status }: { status: string | null }) {
  const { dark } = useTheme()
  if (!status) return <span style={{ color: dark ? 'rgba(245,245,247,0.42)' : 'rgba(10,10,15,0.42)' }}>—</span>

  const suspended = status === 'suspended'
  const bg = suspended
    ? (dark ? 'rgba(255,107,107,0.18)' : 'rgba(255,107,107,0.12)')
    : (dark ? 'rgba(0,212,170,0.18)' : 'rgba(0,168,138,0.12)')
  const color = suspended ? BRAND.red : (dark ? BRAND.mint : BRAND.mintDeep)

  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: bg, color }}>
      {suspended ? 'suspended' : 'active'}
    </span>
  )
}
