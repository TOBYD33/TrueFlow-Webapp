// lib/tax.ts
// Shared helpers for Tax Hub — country/currency mapping, period ranges, and
// the bounded rate-parsing heuristic used for Layer 3 estimates. Tax Hub is a
// tracking and estimating tool, not a filing or guaranteed-accurate calculator.

import { TaxCountry } from '@/types'

export const TAX_COUNTRIES: TaxCountry[] = ['Nigeria', 'Kenya', 'Ghana', 'USA', 'UK']

export const CURRENCY_TO_COUNTRY: Record<string, TaxCountry> = {
  NGN: 'Nigeria',
  KES: 'Kenya',
  GHS: 'Ghana',
  USD: 'USA',
  GBP: 'UK',
}

export const COUNTRY_TO_CURRENCY: Record<TaxCountry, string> = {
  Nigeria: 'NGN',
  Kenya: 'KES',
  Ghana: 'GHS',
  USA: 'USD',
  UK: 'GBP',
}

// Used as the default tax_type when an estimate is requested without one
// specified (e.g. via AI chat) — the closest "tax on what I earned"
// equivalent per country's actual tax_rate_reference rows.
export const DEFAULT_INCOME_TAX_TYPE: Record<TaxCountry, string> = {
  Nigeria: 'Personal Income Tax',
  Kenya: 'Personal Income Tax',
  Ghana: 'Personal Income Tax',
  USA: 'Federal Income Tax',
  UK: 'Income Tax',
}

export const ESTIMATE_DISCLAIMER =
  'This is an estimate for planning purposes only. Confirm with a qualified accountant before filing.'

export function rateReferenceDisclaimer(lastVerifiedDate: string): string {
  return `Reference rates as of ${formatTaxDate(lastVerifiedDate)}. Actual rates vary by business type, income level, and registration status, confirm current rates with a local tax authority or accountant.`
}

export function formatTaxDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export type TaxPeriodKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year'

export const PERIOD_OPTIONS: { value: TaxPeriodKey; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
]

export function getPeriodRange(period: TaxPeriodKey, now: Date = new Date()): { start: string; end: string; label: string } {
  const y = now.getFullYear()
  const m = now.getMonth()

  function iso(d: Date) {
    return d.toISOString().slice(0, 10)
  }

  if (period === 'this_month') {
    return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)), label: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
  }
  if (period === 'last_month') {
    const d = new Date(y, m - 1, 1)
    return { start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
  }
  if (period === 'this_quarter') {
    const q = Math.floor(m / 3)
    return { start: iso(new Date(y, q * 3, 1)), end: iso(new Date(y, q * 3 + 3, 0)), label: `Q${q + 1} ${y}` }
  }
  // this_year
  return { start: iso(new Date(y, 0, 1)), end: iso(new Date(y, 11, 31)), label: `${y}` }
}

/**
 * Extracts a usable estimate percentage from a free-text rate string like
 * "7.5%", "0% to 25% progressive", "0% / 20% / 30%", or "varies by state".
 * Returns null when no number can be parsed at all (e.g. "varies by state") —
 * callers must not fabricate a number in that case.
 */
export function parseRateEstimate(rateStr: string): { pct: number; approximate: boolean } | null {
  const matches = [...rateStr.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => parseFloat(m[1]))
  if (matches.length === 0) return null

  const max = Math.max(...matches)
  const isMultiValue = matches.length > 1
  const hasVagueLanguage = /progressive|up to|varies|marginal/i.test(rateStr)

  return { pct: max / 100, approximate: isMultiValue || hasVagueLanguage }
}
