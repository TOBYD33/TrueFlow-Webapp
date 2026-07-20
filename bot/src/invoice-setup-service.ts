// invoice-setup-service.ts
// Conversational "ask for bank details once, then create the invoice" flow.
// If an organization already has bank details saved, invoice creation is
// immediate. Otherwise this asks for them in a single message and finishes
// the invoice once the reply arrives — mirroring the setup_state pattern
// already used for business-card duplicate checks and guided client setup
// (each flow tags its own state and ignores rows tagged for a different one).

import { supabase } from './supabase'
import { getOrgBankDetails, hasBankDetails, saveOrgBankDetails, createInvoice } from './invoice-service'
import { generateInvoicePdf } from './invoice-pdf-generator'

interface PendingInvoiceState {
  flow: 'invoice_bank_details'
  orgId: string
  clientId?: string
  clientName: string
  amount: number
  currency: string
  description: string
  dueDate?: string
}

export async function getPendingInvoiceSetup(phoneNumber: string): Promise<PendingInvoiceState | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('setup_state')
    .eq('phone_number', phoneNumber)
    .maybeSingle()

  const state = data?.setup_state as any
  if (!state || state.flow !== 'invoice_bank_details') return null
  return state as PendingInvoiceState
}

async function clearPendingInvoiceSetup(phoneNumber: string) {
  await supabase.from('whatsapp_sessions').update({ setup_state: null }).eq('phone_number', phoneNumber)
}

async function finishInvoice(state: Omit<PendingInvoiceState, 'flow'>): Promise<string> {
  const invoice = await createInvoice({
    orgId: state.orgId,
    clientId: state.clientId,
    clientName: state.clientName,
    amount: state.amount,
    currency: state.currency,
    description: state.description,
    dueDate: state.dueDate,
  })

  const pdfUrl = await generateInvoicePdf(invoice.id)

  const amountLabel = `${state.currency} ${state.amount.toLocaleString()}`
  if (!pdfUrl) {
    return `✅ *Invoice ${invoice.invoice_number} created!*\n\n${state.clientName} — ${amountLabel}\n\nI had trouble generating the PDF just now — view and download it anytime at app.gettrueflow.com/invoices`
  }

  return `✅ *Invoice ${invoice.invoice_number} created!*\n\n${state.clientName} — ${amountLabel}\n${pdfUrl}\n\nForward this straight to your client.`
}

// Called from ACTION:CREATE_INVOICE. Returns the reply to send — either the
// finished invoice confirmation, or a request for bank details if the org
// doesn't have any saved yet (asked once, then remembered for every future
// invoice).
export async function startInvoiceCreation(params: {
  orgId: string
  phoneNumber: string
  clientId?: string
  clientName: string
  amount: number
  currency: string
  description: string
  dueDate?: string
}): Promise<string> {
  const bankDetails = await getOrgBankDetails(params.orgId)

  if (hasBankDetails(bankDetails)) {
    return await finishInvoice(params)
  }

  await supabase
    .from('whatsapp_sessions')
    .update({
      setup_state: {
        flow: 'invoice_bank_details',
        orgId: params.orgId,
        clientId: params.clientId,
        clientName: params.clientName,
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        dueDate: params.dueDate,
      },
    })
    .eq('phone_number', params.phoneNumber)

  return (
    `Almost there! I need your business's bank account details for this invoice — I'll remember them for next time.\n\n` +
    `Reply with: *account name, account number, bank name*\n` +
    `e.g. Big Daddy Biz, 0123456789, GTBank`
  )
}

// Called when a pending invoice_bank_details state exists and the user
// replies. Parses "name, number, bank", saves it to the org, then finishes
// the invoice that was waiting on it.
export async function continueInvoiceSetup(
  phoneNumber: string,
  messageText: string,
  state: PendingInvoiceState
): Promise<string> {
  const parts = messageText.split(',').map(p => p.trim()).filter(Boolean)

  if (parts.length < 3) {
    return `I need all three, separated by commas: *account name, account number, bank name*\ne.g. Big Daddy Biz, 0123456789, GTBank`
  }

  const [accountName, accountNumber, ...bankNameParts] = parts
  const bankName = bankNameParts.join(', ')

  await saveOrgBankDetails(state.orgId, { accountName, accountNumber, bankName })
  await clearPendingInvoiceSetup(phoneNumber)

  const confirmation = await finishInvoice(state)
  return `Got it, saved your bank details ✅\n\n${confirmation}`
}
