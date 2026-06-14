// api/scan/route.ts
// Accepts image upload, calls Claude Vision, returns extracted receipt data

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    const response = await claude.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `Extract receipt data. Return ONLY valid JSON, no markdown, no backticks:
{
  "vendor_name": "string or null",
  "amount": number,
  "currency": "NGN",
  "tax_amount": number or null,
  "date": "YYYY-MM-DD",
  "category": "Food & Drink|Transport|Utilities|Office Supplies|Marketing|Rent|Salaries|Other",
  "confidence": "high|medium|low"
}`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const data = JSON.parse(text)
    return NextResponse.json(data)
  } catch (err) {
    console.error('scan route failed:', err)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}
