// invoice-service.ts
// Creates invoices and manages an organization's bank account details —
// the default/fallback payment method shown on every invoice regardless
// of whether a payment-link integration exists.

import { supabase } from './supabase'

export interface OrgBankDetails {
  bank_account_name: string | null
  bank_account_number: string | null
  bank_name: string | null
}

export async function getOrgBankDetails(orgId: string): Promise<OrgBankDetails | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('bank_account_name, bank_account_number, bank_name')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw new Error(`getOrgBankDetails failed: ${error.message}`)
  return data
}

export function hasBankDetails(details: OrgBankDetails | null): boolean {
  return !!(details?.bank_account_name && details?.bank_account_number && details?.bank_name)
}

export async function saveOrgBankDetails(orgId: string, details: {
  accountName: string
  accountNumber: string
  bankName: string
}): Promise<void> {
  const { error } = await supabase
    .from('organizations')
    .update({
      bank_account_name: details.accountName,
      bank_account_number: details.accountNumber,
      bank_name: details.bankName,
    })
    .eq('id', orgId)
  if (error) throw new Error(`saveOrgBankDetails failed: ${error.message}`)
}

// Auto-incrementing per organization, formatted INV-{year}-{seq}. A small
// race window exists between the count and the insert (no DB-level
// sequence per org), acceptable at current WhatsApp-triggered volume —
// revisit with a real per-org sequence/lock if invoice creation ever
// becomes high-concurrency.
export async function getNextInvoiceNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw new Error(`getNextInvoiceNumber failed: ${error.message}`)
  const seq = (count ?? 0) + 1
  return `INV-${year}-${String(seq).padStart(3, '0')}`
}

export async function createInvoice(params: {
  orgId: string
  clientId?: string
  clientName: string
  amount: number
  currency: string
  description: string
  dueDate?: string
}) {
  const invoiceNumber = await getNextInvoiceNumber(params.orgId)
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      org_id: params.orgId,
      client_id: params.clientId ?? null,
      invoice_number: invoiceNumber,
      client_name: params.clientName,
      line_items: [{ description: params.description, quantity: 1, unit_price: params.amount, total: params.amount }],
      subtotal: params.amount,
      tax_rate: 0,
      tax_amount: 0,
      total_amount: params.amount,
      currency: params.currency,
      status: 'sent',
      issue_date: today,
      due_date: params.dueDate ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`createInvoice failed: ${error.message}`)
  return data
}
