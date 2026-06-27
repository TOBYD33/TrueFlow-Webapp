// transfer-detector.ts
// Uses Claude Vision to determine if an image is an incoming payment (client paying YOU)
// or an outgoing expense (YOU paying someone). Extracts structured data from Nigerian bank screenshots.

import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface TransferDetection {
  detection: 'incoming_payment' | 'outgoing_payment' | 'unknown'
  amount: number | null
  currency: string
  sender_name: string | null
  recipient_name: string | null
  bank: string | null
  payment_reference: string | null
  transaction_id: string | null
  date: string | null
  time: string | null
  narration: string | null
  account_number: string | null
  confidence: 'high' | 'medium' | 'low'
}

const TRANSFER_PROMPT = `You are reading a Nigerian bank transfer screenshot or payment proof.
Extract all visible information and return ONLY valid JSON — no markdown, no explanation:

{
  "detection": "incoming_payment or outgoing_payment or unknown",
  "amount": number or null,
  "currency": "NGN",
  "sender_name": "string or null",
  "recipient_name": "string or null",
  "bank": "detected bank name or null",
  "payment_reference": "string or null",
  "transaction_id": "string or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "narration": "string or null",
  "account_number": "last 4 digits only or null",
  "confidence": "high or medium or low"
}

Nigerian banks to recognise: GTBank, Access Bank, Zenith Bank, UBA, First Bank, Opay, PalmPay, Moniepoint, Kuda, Stanbic, Sterling, Wema, FCMB, Polaris, Union Bank, Providus, Jaiz.

INCOMING payment signals (client paying the account owner):
- "Credit alert", "You have received", "Transfer credit", "CR"
- "We have credited your account", "Inflow"
- "Payment received", "Successful transfer to you"

OUTGOING payment signals (account owner paid someone):
- "Debit alert", "Payment made", "You have paid", "DR"
- "POS purchase", "Transfer debit", "Receipt for purchase"

If the image is NOT a bank/payment screenshot, set detection to "unknown".
If direction is ambiguous, set detection to "unknown".
Return ONLY valid JSON.`

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

export async function detectTransfer(imageUrl: string): Promise<TransferDetection | null> {
  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID!,
        password: process.env.TWILIO_AUTH_TOKEN!
      }
    })

    const base64Image = Buffer.from(imageResponse.data as ArrayBuffer).toString('base64')
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
                media_type: contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64Image
              }
            },
            { type: 'text', text: TRANSFER_PROMPT }
          ]
        }
      ]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(extractJSON(raw)) as TransferDetection
    if (!parsed.currency) parsed.currency = 'NGN'
    return parsed
  } catch (err) {
    console.error('detectTransfer failed:', err)
    return null
  }
}
