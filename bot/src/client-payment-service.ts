// client-payment-service.ts
// Records a client payment and atomically updates client + project balances via Supabase RPC.

import { supabase } from './supabase'
import { incrementClientEarned } from './client-service'
import { incrementProjectReceived } from './project-service'

export interface RecordPaymentParams {
  orgId: string
  clientId: string
  projectId?: string | null
  amount: number
  currency?: string
  paymentType?: 'deposit' | 'part_payment' | 'full_payment' | 'retainer'
  paymentDate?: string
  paymentReference?: string | null
  receiptImageUrl?: string | null
  aiTranscript?: string | null
  notes?: string | null
}

export async function recordClientPayment(params: RecordPaymentParams): Promise<void> {
  const {
    orgId,
    clientId,
    projectId,
    amount,
    currency = 'NGN',
    paymentType = 'part_payment',
    paymentDate,
    paymentReference,
    receiptImageUrl,
    aiTranscript,
    notes,
  } = params

  const { error } = await supabase.from('client_payments').insert({
    org_id: orgId,
    client_id: clientId,
    project_id: projectId ?? null,
    amount,
    currency,
    payment_type: paymentType,
    payment_date: paymentDate ?? new Date().toISOString().split('T')[0],
    payment_reference: paymentReference ?? null,
    receipt_image_url: receiptImageUrl ?? null,
    ai_transcript: aiTranscript ?? null,
    notes: notes ?? null,
  })

  if (error) throw new Error(`recordClientPayment insert failed: ${error.message}`)

  // Atomically update totals via RPC functions
  await incrementClientEarned(clientId, amount)
  if (projectId) {
    await incrementProjectReceived(projectId, amount)
  }
}
