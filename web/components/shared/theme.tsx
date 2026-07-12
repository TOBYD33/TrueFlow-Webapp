'use client'
// components/shared/theme.tsx
// TrueFlow design system: brand color tokens + light/dark theme context.
// Single source of truth — every component imports from here, never inline
// hex duplicates. Palette per CLAUDE.md brand identity.

import { createContext, useContext, useState, useEffect } from 'react'

// ── Brand tokens ─────────────────────────────────────────────────────────
export const BRAND = {
  violet: '#6C63FF',       // Electric Violet — primary accent
  violetLight: '#C9C5FF',
  mint: '#00D4AA',         // Mint Verify — secondary accent / success
  mintDeep: '#00A88A',     // deeper mint for contrast
  black: '#0A0A0F',        // Rich Black — dark base
  cloud: '#F5F5F7',        // Cloud White — light base
  red: '#FF6B6B',          // Alert Red
  amber: '#FFB545',        // Warn Amber
  whatsapp: '#25D366',
} as const

// Mode-dependent surface/text tokens
export function tone(dark: boolean) {
  return {
    page: dark ? BRAND.black : BRAND.cloud,
    surface: dark ? '#14141B' : '#FFFFFF',
    chrome: dark ? BRAND.black : '#FFFFFF',
    border: dark ? 'rgba(245,245,247,0.08)' : 'rgba(10,10,15,0.06)',
    text: dark ? BRAND.cloud : BRAND.black,
    textMid: dark ? 'rgba(245,245,247,0.60)' : 'rgba(10,10,15,0.55)',
    textDim: dark ? 'rgba(245,245,247,0.42)' : 'rgba(10,10,15,0.42)',
    hover: dark ? 'rgba(245,245,247,0.06)' : 'rgba(10,10,15,0.04)',
    cardShadow: dark ? 'none' : '0 1px 3px rgba(10,10,15,0.05), 0 8px 24px rgba(10,10,15,0.04)',
  }
}

// ── Theme context ────────────────────────────────────────────────────────
interface ThemeValue {
  dark: boolean
  setDark: (d: boolean) => void
}

const ThemeContext = createContext<ThemeValue>({ dark: false, setDark: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light mode is the default. State lives in the persistent (protected)
  // layout shell, so it survives client-side navigation within a session.
  const [dark, setDark] = useState(false)

  // The app's CSS uses class-based dark mode (`.dark` on <html> flips the
  // shadcn tokens: --background, --card, --card-foreground, etc.). Without
  // this, cards keep their light background in dark mode.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])

  return <ThemeContext.Provider value={{ dark, setDark }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext)
}
