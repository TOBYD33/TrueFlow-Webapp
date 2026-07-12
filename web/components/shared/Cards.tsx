'use client'
// components/shared/Cards.tsx
// App-wide themed card primitives, promoted from the approved
// /dashboard-concept design. Use these instead of components/ui/card on
// pages converted to the new design system.

import { useTheme, tone, BRAND } from './theme'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

// ── Standard content card ────────────────────────────────────────────────
export function ThemedCard({
  title,
  action,
  children,
  className = '',
  padded = true,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  padded?: boolean
}) {
  const { dark } = useTheme()
  const t = tone(dark)
  return (
    <div
      className={`rounded-2xl transition-colors duration-300 ${padded ? 'p-5' : ''} ${className}`}
      style={{
        background: t.surface,
        boxShadow: t.cardShadow,
        border: `1px solid ${t.border}`,
      }}
    >
      {(title || action) && (
        <div className={`flex items-center justify-between mb-4 ${padded ? '' : 'p-5 pb-0'}`}>
          {title && <h3 className="text-[15px] font-semibold" style={{ color: t.text }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Stat card with % change chip ─────────────────────────────────────────
export function ThemedStatCard({
  label,
  value,
  change,
  changeLabel = 'to last month',
  sub,
  icon,
}: {
  label: string
  value: string
  change?: number | null
  changeLabel?: string
  sub?: string
  icon?: React.ReactNode
}) {
  const { dark } = useTheme()
  const t = tone(dark)
  const up = (change ?? 0) >= 0
  return (
    <ThemedCard>
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium" style={{ color: t.textMid }}>{label}</p>
        {icon && <span style={{ color: BRAND.violet }}>{icon}</span>}
      </div>
      <p className="text-[26px] font-bold mt-1.5 tracking-tight" style={{ color: t.text }}>{value}</p>
      <div className="flex items-center gap-1.5 mt-1.5">
        {change !== null && change !== undefined ? (
          <>
            <span
              className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md"
              style={
                up
                  ? { background: 'rgba(0,212,170,0.12)', color: BRAND.mintDeep }
                  : { background: 'rgba(255,107,107,0.12)', color: BRAND.red }
              }
            >
              {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(change)}%
            </span>
            <span className="text-xs" style={{ color: t.textDim }}>{changeLabel}</span>
          </>
        ) : (
          <span className="text-xs" style={{ color: t.textDim }}>{sub ?? 'this month'}</span>
        )}
      </div>
    </ThemedCard>
  )
}

// ── Page header (title + optional actions) ───────────────────────────────
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  const { dark } = useTheme()
  const t = tone(dark)
  return (
    <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: t.text }}>{title}</h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: t.textDim }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Primary / secondary buttons in brand style ───────────────────────────
export function BrandButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  const { dark } = useTheme()
  const t = tone(dark)
  const styles =
    variant === 'primary'
      ? { background: BRAND.violet, color: '#FFFFFF' }
      : variant === 'danger'
        ? { background: 'rgba(255,107,107,0.12)', color: BRAND.red }
        : { background: 'transparent', color: t.text, border: `1px solid ${t.border}` }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90 ${className}`}
      style={styles}
    >
      {children}
    </button>
  )
}
