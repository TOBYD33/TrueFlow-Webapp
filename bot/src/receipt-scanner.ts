// receipt-scanner.ts
// Uses Claude Vision to extract structured data from a receipt image.
// Downloads the image from Twilio's URL, sends to Claude, saves result to Supabase.

import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import { supabase } from './supabase'
import { ScannedReceipt } from '../types'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VALID_CATEGORIES = [
  'Food & Drink', 'Transport', 'Utilities', 'Office Supplies',
  'Marketing', 'Rent', 'Salaries', 'Other'
]

export async function scanReceipt(
  imageUrl: string,
  orgId: string,
  userId: string,
  currency: string
): Promise<ScannedReceipt | null> {
  try {
    // Download image from Twilio (requires basic auth with account SID + auth token)
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID!,
        password: process.env.TWILIO_AUTH_TOKEN!
      }
    })

    const base64Image = Buffer.from(imageResponse.data).toString('base64')
    const contentType = String(imageResponse.headers['content-type'] || 'image/jpeg')

    const response = await claude.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: contentType as any,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Extract receipt data and return ONLY valid JSON. No markdown, no explanation.

{
  "vendor_name": "string or null",
  "amount": number or null,
  "tax_amount": number or null,
  "date": "YYYY-MM-DD or today's date if unclear",
  "category": "one of: ${VALID_CATEGORIES.join(' | ')}",
  "notes": "any extra context or null",
  "ai_confidence": "high | medium | low"
}

Rules:
- amount is the total paid (numeric, no currency symbols)
- tax_amount is VAT/tax line if visible, else null
- category must be exactly one of the valid values
- ai_confidence: high = all fields clear, medium = some guessing, low = very unclear
- date format: YYYY-MM-DD`
            }
          ]
        }
      ]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.trim()) as ScannedReceipt
    parsed.currency = currency

    // Upload image to Supabase Storage
    const timestamp = Date.now()
    const storagePath = `receipts/${orgId}/${timestamp}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(storagePath, imageResponse.data, { contentType })

    const imageStorageUrl = uploadError
      ? imageUrl
      : supabase.storage.from('receipts').getPublicUrl(storagePath).data.publicUrl

    // Save receipt to database
    const { error: insertError } = await supabase.from('receipts').insert({
      org_id: orgId,
      uploaded_by: userId,
      uploaded_via: 'whatsapp',
      vendor_name: parsed.vendor_name,
      amount: parsed.amount,
      currency,
      tax_amount: parsed.tax_amount,
      date: parsed.date,
      category: parsed.category,
      notes: parsed.notes,
      image_url: imageStorageUrl,
      ai_confidence: parsed.ai_confidence,
      is_verified: false
    })

    if (insertError) console.error('scanReceipt: insert failed:', insertError)

    return parsed
  } catch (err) {
    console.error('scanReceipt failed:', err)
    return null
  }
}
