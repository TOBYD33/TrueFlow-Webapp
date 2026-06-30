// tax-service.ts
// Tax Hub logic for the WhatsApp channel — reference rates, bounded liability
// estimates, and country switching. Mirrors web/lib/tax.ts + the
// /api/tax/estimate route since the bot is a separate Node project and
// cannot import from /web. This is a tracking and estimating tool, not a
// tax filing or guaranteed-accurate calculator — never present an estimate
// as finalized.

import { supabase } from './supabase'

export type TaxCountry = 'Nigeria' | 'Kenya' | 'Ghana' | 'USA' | 'UK'
export type TaxPeriodKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year'

export const TAX_COUNTRIES: TaxCountry[] = ['Nigeria', 'Kenya', 'Ghana', 'USA', 'UK']

export const COUNTRY_TO_CURRENCY: Record<TaxCountry, string> = {
  Nigeria: 'NGN',
  Kenya: 'KES',
  Ghana: 'GHS',
  USA: 'USD',
  UK: 'GBP',
}

// Used as the default tax_type for ACTION:GET_TAX_ESTIMATE, which carries
// no tax_type of its own — this is the closest "tax on what I earned"
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
  return `Reference rate as of ${lastVerifiedDate}. Actual rates vary by business type, income level, and registration status — confirm current rates with a local tax authority or accountant.`
}

export function getPeriodRange(period: TaxPeriodKey, now: Date = new Date()): { start: string; end: string; label: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  const iso = (d: Date) => d.toISOString().slice(0, 10)

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
  return { start: iso(new Date(y, 0, 1)), end: iso(new Date(y, 11, 31)), label: `${y}` }
}

export function parseRateEstimate(rateStr: string): { pct: number; approximate: boolean } | null {
  const matches = [...rateStr.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => parseFloat(m[1]))
  if (matches.length === 0) return null

  const max = Math.max(...matches)
  const isMultiValue = matches.length > 1
  const hasVagueLanguage = /progressive|up to|varies|marginal/i.test(rateStr)

  return { pct: max / 100, approximate: isMultiValue || hasVagueLanguage }
}

export async function getAllTaxRates() {
  const { data, error } = await supabase
    .from('tax_rate_reference')
    .select('*')
    .order('country')
    .order('tax_type')

  if (error) throw new Error(error.message)
  return data || []
}

export async function getTaxRatesForCountry(country: string) {
  const { data, error } = await supabase
    .from('tax_rate_reference')
    .select('*')
    .eq('country', country)
    .order('tax_type')

  if (error) throw new Error(error.message)
  return data || []
}

export async function setTaxCountry(orgId: string, country: TaxCountry) {
  const { error } = await supabase
    .from('organizations')
    .update({ default_tax_country: country })
    .eq('id', orgId)

  if (error) throw new Error(error.message)
}

export async function calculateTaxEstimate(params: {
  orgId: string
  country: TaxCountry
  taxType: string
  period: TaxPeriodKey
  persist?: boolean
}) {
  const { orgId, country, taxType, period, persist = false } = params

  const { data: rateRow, error: rateError } = await supabase
    .from('tax_rate_reference')
    .select('*')
    .eq('country', country)
    .eq('tax_type', taxType)
    .maybeSingle()

  if (rateError) throw new Error(rateError.message)
  if (!rateRow) return null

  const range = getPeriodRange(period)

  const { data: payments, error: paymentsError } = await supabase
    .from('client_payments')
    .select('amount')
    .eq('org_id', orgId)
    .gte('payment_date', range.start)
    .lte('payment_date', range.end)

  if (paymentsError) throw new Error(paymentsError.message)

  const taxableIncome = (payments || []).reduce((sum, p: any) => sum + Number(p.amount), 0)
  const currency = COUNTRY_TO_CURRENCY[country]
  const parsed = parseRateEstimate(rateRow.rate)

  if (!parsed) {
    return {
      computable: false as const,
      taxableIncome,
      currency,
      rateLabel: rateRow.rate,
      lastVerifiedDate: rateRow.last_verified_date,
      periodLabel: range.label,
    }
  }

  const liability = taxableIncome * parsed.pct

  if (persist) {
    const { error: insertError } = await supabase.from('tax_estimates').insert({
      org_id: orgId,
      period_start: range.start,
      period_end: range.end,
      country,
      estimated_taxable_income: taxableIncome,
      estimated_liability: liability,
      tax_type: taxType,
    })
    if (insertError) console.error('tax_estimates insert failed:', insertError)
  }

  return {
    computable: true as const,
    taxableIncome,
    liability,
    approximate: parsed.approximate,
    currency,
    rateLabel: rateRow.rate,
    lastVerifiedDate: rateRow.last_verified_date,
    periodLabel: range.label,
  }
}

export function formatEstimateReply(taxType: string, country: string, result: NonNullable<Awaited<ReturnType<typeof calculateTaxEstimate>>>): string {
  if (!result.computable) {
    return `${taxType} in ${country} is set at *${result.rateLabel}* — that can't be reduced to a single number I can calculate from. Check with a local tax authority or accountant. (${rateReferenceDisclaimer(result.lastVerifiedDate)})`
  }

  const amount = `${result.currency} ${result.taxableIncome.toLocaleString()}`
  const liability = `${result.currency} ${Math.round(result.liability).toLocaleString()}`

  let reply = `Based on ${amount} recorded income this ${result.periodLabel}, your estimated *${taxType}* liability is approximately *${liability}*.\n\n${ESTIMATE_DISCLAIMER}`

  if (result.approximate) {
    reply = `⚠️ ${taxType} (${result.rateLabel}) is a progressive or multi-tier rate — this uses the top rate as a rough upper bound, not your actual band.\n\n` + reply
  }

  return reply
}
