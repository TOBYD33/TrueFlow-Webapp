// image-analyzer.ts
// Downloads a Twilio image ONCE and runs a single Claude Vision call that both
// classifies the payment direction AND extracts all relevant fields.
// Prevents double-downloading and double-API-calls that would exceed Twilio's 15s timeout.

import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ImageAnalysis {
  content_type: 'financial' | 'business_card'
  direction: 'incoming' | 'outgoing' | 'unknown'
  image_type: 'vendor_receipt' | 'bank_transfer_receipt' | 'sms_credit' | 'sms_debit' | 'other'
  // Incoming payment (client paid you)
  sender_name: string | null
  // Outgoing expense (you paid someone)
  vendor_name: string | null
  category: string
  tax_amount: number | null
  // Common fields
  amount: number | null
  currency: string
  date: string | null
  bank: string | null
  reference: string | null
  narration: string | null
  confidence: 'high' | 'medium' | 'low'
  // Business card fields (content_type === 'business_card' only)
  contact_name: string | null
  contact_company: string | null
  contact_role: string | null
  contact_phone: string | null
  contact_email: string | null
  // Raw image buffer passed through — no re-download needed downstream
  buffer: Buffer
  contentType: string
}

const ANALYSIS_PROMPT = `You are analyzing an image sent to TrueFlow, a Nigerian business finance app.

FIRST, decide the content_type:
- "business_card" = a business card or contact card: a person's name, job title,
  company, and contact details (phone/email), no monetary amounts, laid out like
  a printed or digital business card.
- "financial" = anything else relevant to money: a vendor/shop receipt, a bank
  transfer receipt PDF, a bank SMS credit/debit alert screenshot, etc.

IF content_type is "business_card", extract the contact fields and set every
financial field (direction, image_type, sender_name, vendor_name, category,
amount, date, bank, reference, narration, tax_amount) to null, "unknown", or
"other" as appropriate — do NOT guess financial data from a business card.

IF content_type is "financial", apply these DIRECTION RULES:
- "incoming" = money came TO the user (client paid them). Signals: "CR Amt", "NIP/ABN/", "Credit Alert", "You have received", "Inflow", page shows the user as Beneficiary
- "outgoing" = user paid someone (an expense). Signals: "DR Amt", "NIP CR//", "Debit Alert", "Debit Account", "You have paid", "POS", "Airtime", shop/vendor receipt
- "unknown" = truly cannot determine direction
And set every business card field (contact_name, contact_company, contact_role,
contact_phone, contact_email) to null.

Return ONLY valid JSON, no markdown, no explanation:
{
  "content_type": "financial or business_card",
  "direction": "incoming or outgoing or unknown",
  "image_type": "vendor_receipt or bank_transfer_receipt or sms_credit or sms_debit or other",
  "sender_name": "name of person who sent money to user (incoming only) or null",
  "vendor_name": "shop or company the user paid (outgoing only) or null",
  "category": "Food & Drink or Transport or Utilities or Office Supplies or Marketing or Rent or Salaries or Other",
  "amount": number or null,
  "currency": "NGN",
  "date": "YYYY-MM-DD or null",
  "bank": "bank name or null",
  "reference": "transaction reference number or null",
  "narration": "transaction description/narration or null",
  "tax_amount": number or null,
  "confidence": "high or medium or low",
  "contact_name": "full name on the business card, or null",
  "contact_company": "company name on the business card, or null",
  "contact_role": "job title on the business card, or null",
  "contact_phone": "phone number on the business card, or null",
  "contact_email": "email on the business card, or null"
}

Nigerian banks to recognise: GTBank, Access Bank, Zenith Bank, UBA, First Bank, Opay, PalmPay, Moniepoint, Kuda, Stanbic, Sterling, Wema, FCMB, Polaris, Union Bank, Providus, Jaiz.
For SMS alerts, the bank can often be inferred from the account number format or the SMS sender.

Return ONLY valid JSON.`

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

export async function analyzeImage(imageUrl: string): Promise<ImageAnalysis | null> {
  try {
    // Download image ONCE — buffer reused for storage, no second download needed
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID!,
        password: process.env.TWILIO_AUTH_TOKEN!
      }
    })

    const buffer = Buffer.from(imageResponse.data as ArrayBuffer)
    const contentType = String(imageResponse.headers['content-type'] || 'image/jpeg')
    const base64Image = buffer.toString('base64')

    const response = await claude.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
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
            { type: 'text', text: ANALYSIS_PROMPT }
          ]
        }
      ]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(extractJSON(raw)) as Omit<ImageAnalysis, 'buffer' | 'contentType'>

    if (!parsed.currency) parsed.currency = 'NGN'
    if (!parsed.category) parsed.category = 'Other'
    if (!parsed.content_type) parsed.content_type = 'financial'

    return { ...parsed, buffer, contentType }
  } catch (err) {
    console.error('analyzeImage failed:', err)
    return null
  }
}

export function buildMissingFieldsNote(analysis: ImageAnalysis): string {
  const missing: string[] = []
  if (!analysis.amount) missing.push('amount')
  if (!analysis.date) missing.push('date')
  if (analysis.direction === 'outgoing' && !analysis.vendor_name) missing.push('vendor name')
  if (analysis.direction === 'incoming' && !analysis.sender_name) missing.push('sender name')

  if (missing.length === 0 && analysis.confidence !== 'low') return ''

  const appUrl = process.env.WEBAPP_URL || 'app.gettrueflow.com'
  const section = analysis.direction === 'incoming' ? 'income' : 'receipts'

  if (missing.length > 0) {
    return `\n\n⚠️ Couldn't read: ${missing.join(', ')}. Complete it at *${appUrl}/${section}*`
  }
  return `\n\n⚠️ Low confidence scan — please verify at *${appUrl}/${section}*`
}
