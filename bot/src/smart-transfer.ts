// smart-transfer.ts
// Handles the Smart Transfer Recognition flow:
// saves incoming client payments to the client_payments table,
// attempts to match a client by sender name, and builds the WhatsApp reply.

import axios from 'axios'
import { supabase } from './supabase'
import { TransferDetection } from './transfer-detector'
import { buildIncomingPaymentReply } from './bank-reader'
import { UserContext } from '../types'

export async function handleIncomingPayment(
  transfer: TransferDetection,
  imageUrl: string,
  user: UserContext
): Promise<string> {
  const currency = user.currency || 'NGN'
  const amount = transfer.amount ?? 0
  const date = transfer.date || new Date().toISOString().split('T')[0]

  // Try to match an existing active client by sender name (first word fuzzy match)
  let matchedClient: { id: string; name: string; total_earned: number } | null = null

  if (transfer.sender_name) {
    const firstWord = transfer.sender_name.split(' ')[0]
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

  // Upload screenshot to Supabase Storage
  let receiptImageUrl = imageUrl
  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID!,
        password: process.env.TWILIO_AUTH_TOKEN!
      }
    })
    const contentType = String(imageResponse.headers['content-type'] || 'image/jpeg')
    const timestamp = Date.now()
    const folder = matchedClient ? matchedClient.id : 'unlinked'
    const storagePath = `client-receipts/${user.org_id}/${folder}/${timestamp}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('client-receipts')
      .upload(storagePath, imageResponse.data as ArrayBuffer, { contentType })

    if (!uploadError) {
      receiptImageUrl = supabase.storage
        .from('client-receipts')
        .getPublicUrl(storagePath).data.publicUrl
    }
  } catch (err) {
    console.error('handleIncomingPayment: image upload failed:', err)
    // Fall back to Twilio URL — not ideal but keeps the record intact
  }

  // Save to client_payments
  const { error: insertError } = await supabase.from('client_payments').insert({
    org_id: user.org_id,
    client_id: matchedClient?.id ?? null,
    amount,
    currency,
    payment_type: 'part_payment',
    payment_date: date,
    payment_reference: transfer.payment_reference ?? transfer.transaction_id ?? null,
    receipt_image_url: receiptImageUrl,
    ai_transcript: JSON.stringify(transfer),
    notes: transfer.narration ?? null,
  })

  if (insertError) {
    console.error('handleIncomingPayment: client_payments insert failed:', insertError)
  }

  // Update client total_earned if matched
  if (matchedClient && amount > 0) {
    const currentEarned = matchedClient.total_earned ?? 0
    const { error: updateError } = await supabase
      .from('clients')
      .update({ total_earned: currentEarned + amount })
      .eq('id', matchedClient.id)

    if (updateError) {
      console.error('handleIncomingPayment: client update failed:', updateError)
    }
  }

  return buildIncomingPaymentReply(transfer, currency, matchedClient?.name ?? null)
}
