// api/chat/scan/route.ts
// Handles receipt/payment image uploads from TrueFlow Chat.
// Analyzes with Claude Vision, creates receipt or client_payment record,
// and returns a conversational reply to display in the chat.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SCAN_PROMPT = `Analyze this image. It could be a receipt, invoice, bank transfer screenshot, or payment proof.

Return ONLY valid JSON — no markdown, no explanation:
{
  "direction": "outgoing" | "incoming" | "unknown",
  "image_type": "vendor_receipt" | "bank_transfer" | "sms_alert" | "invoice" | "other",
  "vendor_name": "string or null",
  "sender_name": "string or null",
  "amount": number or null,
  "currency": "NGN",
  "tax_amount": number or null,
  "date": "YYYY-MM-DD or null",
  "category": "Food & Drink" | "Transport" | "Utilities" | "Office Supplies" | "Marketing" | "Rent" | "Salaries" | "Other",
  "bank": "bank name or null",
  "reference": "string or null",
  "narration": "string or null",
  "confidence": "high" | "medium" | "low"
}

direction rules:
- "outgoing" = money you spent (receipts, purchase invoices, debit alerts)
- "incoming" = money received from a client (credit alerts, transfer proofs, payment screenshots)
- "unknown" = cannot determine direction

Nigerian banks to recognise: GTBank, Access Bank, Zenith Bank, UBA, First Bank,
Opay, Palmpay, Moniepoint, Kuda, Stanbic, Sterling, FCMB, Polaris.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided.' }, { status: 400 })

    const admin = getAdmin()
    const chatId = `web:${user.id}`

    // Get org
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No organisation found.' }, { status: 400 })

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // Call Claude Vision
    const response = await claude.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: SCAN_PROMPT },
        ],
      }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    let analysis: any = null

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Could not read that image. Please try a clearer photo.' }, { status: 422 })
    }

    if (!analysis) {
      return NextResponse.json({ error: 'Could not read that image. Please try a clearer photo.' }, { status: 422 })
    }

    // Upload image to Supabase Storage
    const timestamp = Date.now()
    const ext = file.name.split('.').pop() ?? 'jpg'
    let imageUrl: string | null = null

    if (analysis.direction === 'incoming') {
      const path = `client-receipts/${member.org_id}/unlinked/${timestamp}.${ext}`
      const { data: uploaded } = await admin.storage.from('receipts').upload(path, buffer, { contentType: mediaType })
      if (uploaded) {
        const { data: pub } = admin.storage.from('receipts').getPublicUrl(path)
        imageUrl = pub?.publicUrl ?? null
      }
    } else {
      const path = `receipts/${member.org_id}/${timestamp}.${ext}`
      const { data: uploaded } = await admin.storage.from('receipts').upload(path, buffer, { contentType: mediaType })
      if (uploaded) {
        const { data: pub } = admin.storage.from('receipts').getPublicUrl(path)
        imageUrl = pub?.publicUrl ?? null
      }
    }

    let reply = ''
    const currency = analysis.currency ?? 'NGN'
    const symbol = currency === 'NGN' ? '₦' : currency + ' '
    const amountStr = analysis.amount ? `${symbol}${Number(analysis.amount).toLocaleString()}` : 'unknown amount'

    if (analysis.direction === 'outgoing' || analysis.direction === 'unknown' && analysis.image_type === 'vendor_receipt') {
      // Create expense receipt
      const { error: receiptError } = await admin.from('receipts').insert({
        org_id: member.org_id,
        uploaded_by: user.id,
        uploaded_via: 'web',
        vendor_name: analysis.vendor_name,
        amount: analysis.amount,
        currency,
        tax_amount: analysis.tax_amount,
        date: analysis.date ?? new Date().toISOString().split('T')[0],
        category: analysis.category ?? 'Other',
        image_url: imageUrl,
        ai_transcript: rawText,
        ai_confidence: analysis.confidence,
        is_verified: false,
      })

      if (receiptError) {
        reply = `⚠️ I read the receipt but couldn't save it: ${receiptError.message}`
      } else {
        reply = `✅ Receipt saved!\n\n• **Vendor**: ${analysis.vendor_name ?? 'Unknown'}\n• **Amount**: ${amountStr}\n• **Category**: ${analysis.category ?? 'Other'}\n• **Date**: ${analysis.date ?? 'Today'}\n• **Confidence**: ${analysis.confidence}`
        if (analysis.confidence === 'low') {
          reply += `\n\n⚠️ Low confidence — please check the details in Receipts and update if needed.`
        }
        if (analysis.tax_amount) {
          reply += `\n• **Tax**: ${symbol}${Number(analysis.tax_amount).toLocaleString()}`
        }
      }
    } else if (analysis.direction === 'incoming') {
      // Log as unlinked income — user can link to client later
      const { error: paymentError } = await admin.from('client_payments').insert({
        org_id: member.org_id,
        client_id: null,
        amount: analysis.amount,
        currency,
        payment_type: 'part_payment',
        payment_date: analysis.date ?? new Date().toISOString().split('T')[0],
        payment_reference: analysis.reference,
        receipt_image_url: imageUrl,
        ai_transcript: rawText,
        notes: `Unlinked payment from ${analysis.sender_name ?? 'unknown sender'}. Uploaded via TrueFlow Chat.`,
      })

      if (paymentError) {
        reply = `⚠️ I read the payment proof but couldn't save it: ${paymentError.message}`
      } else {
        reply = `💰 Payment received!\n\n• **From**: ${analysis.sender_name ?? 'Unknown sender'}\n• **Amount**: ${amountStr}\n• **Bank**: ${analysis.bank ?? 'Unknown'}\n• **Date**: ${analysis.date ?? 'Today'}\n• **Reference**: ${analysis.reference ?? '—'}\n\nSaved as unlinked income. Go to **Income** to attach it to a client.`
      }
    } else {
      reply = `❓ I can see this is a financial document but couldn't tell if it's an expense or income.\n\nAmount visible: ${amountStr}\n\nPlease go to **Receipts** or **Income** to add it manually.`
    }

    // Save to chat history
    await admin.from('whatsapp_conversations').insert([
      { phone_number: chatId, role: 'user', content: '📎 [Image uploaded]' },
      { phone_number: chatId, role: 'assistant', content: reply },
    ])

    return NextResponse.json({ success: true, reply, direction: analysis.direction, analysis })
  } catch (err) {
    console.error('chat/scan: error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
