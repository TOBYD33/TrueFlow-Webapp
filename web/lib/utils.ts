import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export const CATEGORIES = [
  'Food & Drink',
  'Transport',
  'Utilities',
  'Office Supplies',
  'Marketing',
  'Rent',
  'Salaries',
  'Other',
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink': '#f97316',
  Transport: '#3b82f6',
  Utilities: '#8b5cf6',
  'Office Supplies': '#06b6d4',
  Marketing: '#ec4899',
  Rent: '#ef4444',
  Salaries: '#10b981',
  Other: '#6b7280',
}

export const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  solo: Infinity,
  business: Infinity,
  pro: Infinity,
  enterprise: Infinity,
}
