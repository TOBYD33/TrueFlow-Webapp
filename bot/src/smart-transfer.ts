// smart-transfer.ts
// Saves an incoming client payment to the client_payments table.
// Accepts pre-analyzed image data from image-analyzer — no second Claude call or image download.
// Uses client-service for matching and client-payment-service for atomic balance updates.

import { supabase } from './supabase'
import { ImageAnalysis, buildMissingFieldsNote } from './image-analyzer'
import { normaliseBankName, toTitleCase, formatPaymentDate } from './bank-reader'
import { findClientByName } from './client-service'
import { recordClientPayment } from './client-payment-service'
import { UserContext } from '../types'

export async function handleIncomingPayment(
  analysis: ImageAnalysis,
  user: UserContext
): Promise<string> {
  const currency = user.currency || 'NGN'
  const amount = analysis.amount ?? 0
  const date = analysis.date || new Date().toISOString().split('T')[0]

  // Try to match an existing active client by sender name
  let matchedClient: { id: string; name: string } | null = null
  if (analysis.sender_name) {
    matchedClient = await findClientByName(user.org_id, analysis.sender_name)
  }

  // Upload image to Supabase Storage (already downloaded — no re-fetch)
  let receiptImageUrl = ''
  try {
    const timestamp = Date.now()
    const folder = matchedClient ? matchedClient.id : 'unlinked'
    const storagePath = `client-receipts/${user.org_id}/${folder}/${timestamp}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('client-receipts')
      .upload(storagePath, analysis.buffer, { contentType: analysis.contentType })

    if (!uploadError) {
      receiptImageUrl = supabase.storage
        .from('client-receipts')
        .getPublicUrl(storagePath).data.publicUrl
    }
  } catch (err) {
    console.error('handleIncomingPayment: image upload failed:', err)
  }

  if (!matchedClient) {
    // No client matched — save unlinked, prompt user to create the client
    const { error: insertError } = await supabase.from('client_payments').insert({
      org_id: user.org_id,
      client_id: null,
      amount,
      currency,
      payment_type: 'part_payment',
      payment_date: date,
      payment_reference: analysis.reference ?? null,
      receipt_image_url: receiptImageUrl || null,
      ai_transcript: JSON.stringify(analysis),
      notes: analysis.narration ?? null,
    })
    if (insertError) {
      console.error('handleIncomingPayment: unlinked insert failed:', insertError)
    }
    return buildIncomingReply(analysis, currency, null)
  }

  // Matched client — record payment and atomically update client + project balances
  try {
    await recordClientPayment({
      orgId: user.org_id,
      clientId: matchedClient.id,
      amount,
      currency,
      paymentType: 'part_payment',
      paymentDate: date,
      paymentReference: analysis.reference ?? null,
      receiptImageUrl: receiptImageUrl || null,
      aiTranscript: JSON.stringify(analysis),
      notes: analysis.narration ?? null,
    })
  } catch (err) {
    console.error('handleIncomingPayment: recordClientPayment failed:', err)
  }

  return buildIncomingReply(analysis, currency, matchedClient.name)
}

function buildIncomingReply(
  analysis: ImageAnalysis,
  currency: string,
  matchedClientName: string | null
): string {
  const amountStr = analysis.amount
    ? `${currency} ${Number(analysis.amount).toLocaleString()}`
    : 'unknown amount'
  const sender = analysis.sender_name
    ? `*${toTitleCase(analysis.sender_name)}*`
    : 'Unknown sender'
  const bank = normaliseBankName(analysis.bank)
  const bankStr = bank ? ` (${bank})` : ''
  const dateStr = formatPaymentDate(analysis.date)
  const refStr = analysis.reference ? `\nRef: ${analysis.reference}` : ''
  const missingNote = buildMissingFieldsNote(analysis)
  const appUrl = process.env.WEBAPP_URL || 'app.trueflio.com'

  if (matchedClientName) {
    return (
      `✅ *Payment received!*\n\n` +
      `*${amountStr}* from ${sender}${bankStr}\n` +
      `Date: ${dateStr}${refStr}\n\n` +
      `Logged to *${matchedClientName}*'s account.\n` +
      `Open your dashboard to link it to a specific project.` +
      missingNote
    )
  }

  return (
    `📥 *Payment received!*\n\n` +
    `*${amountStr}* from ${sender}${bankStr}\n` +
    `Date: ${dateStr}${refStr}\n\n` +
    `No matching client found. Visit *${appUrl}/income* to link it to a client, or say "New client [name]" to create one.` +
    missingNote
  )
}
