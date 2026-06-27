// smart-transfer.ts
// Saves an incoming client payment to the client_payments table.
// Accepts pre-analyzed image data from image-analyzer — no second Claude call or image download.

import { supabase } from './supabase'
import { ImageAnalysis, buildMissingFieldsNote } from './image-analyzer'
import { normaliseBankName, toTitleCase, formatPaymentDate } from './bank-reader'
import { UserContext } from '../types'

export async function handleIncomingPayment(
  analysis: ImageAnalysis,
  user: UserContext
): Promise<string> {
  const currency = user.currency || 'NGN'
  const amount = analysis.amount ?? 0
  const date = analysis.date || new Date().toISOString().split('T')[0]

  // Try to match an existing active client by sender name (first word fuzzy)
  let matchedClient: { id: string; name: string; total_earned: number } | null = null

  if (analysis.sender_name) {
    const firstWord = analysis.sender_name.split(' ')[0]
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, total_earned')
      .eq('org_id', user.org_id)
      .eq('status', 'active')
      .ilike('name', `%${firstWord}%`)
      .limit(1)

    if (clients && clients.length > 0) {
      matchedClient = clients[0] as { id: string; name: string; total_earned: number }
    }
  }

  // Upload image buffer to Supabase Storage (already downloaded — no re-fetch)
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

  // Save to client_payments
  const { error: insertError } = await supabase.from('client_payments').insert({
    org_id: user.org_id,
    client_id: matchedClient?.id ?? null,
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
    console.error('handleIncomingPayment: insert failed:', insertError)
  }

  // Update client total_earned if matched
  if (matchedClient && amount > 0) {
    const currentEarned = matchedClient.total_earned ?? 0
    await supabase
      .from('clients')
      .update({ total_earned: currentEarned + amount })
      .eq('id', matchedClient.id)
  }

  return buildIncomingReply(analysis, currency, matchedClient?.name ?? null)
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

  if (matchedClientName) {
    return (
      `✅ *Payment received!*\n\n` +
      `*${amountStr}* from ${sender}${bankStr}\n` +
      `Date: ${dateStr}${refStr}\n\n` +
      `Logged to *${matchedClientName}*'s account.\n` +
      `Open your web dashboard to link it to a specific project.` +
      missingNote
    )
  }

  const appUrl = process.env.WEBAPP_URL || 'app.gettrueflow.com'
  return (
    `📥 *Payment received!*\n\n` +
    `*${amountStr}* from ${sender}${bankStr}\n` +
    `Date: ${dateStr}${refStr}\n\n` +
    `No matching client found. Visit *${appUrl}/income* to link it to a client.` +
    missingNote
  )
}
