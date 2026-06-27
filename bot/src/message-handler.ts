// message-handler.ts
// Orchestrates the full message handling flow for every incoming WhatsApp message.
// Images are downloaded ONCE and analyzed in a SINGLE Claude Vision call to avoid
// Twilio's 15-second webhook timeout. Direction determines whether the image is
// an incoming client payment or an outgoing expense.

import { getOrCreateUser, isNewUser, markUserNotNew, getMonthlyReceiptCount } from './user-service'
import { analyzeImage, buildMissingFieldsNote } from './image-analyzer'
import { handleIncomingPayment } from './smart-transfer'
import { saveFromAnalysis } from './receipt-scanner'
import { getAIResponse, getWelcomeMessage } from './ai-assistant'
import { executeActions } from './action-executor'
import { buildTextResponse } from './twiml-builder'
import { TwilioWebhookBody } from '../types'

const FREE_TIER_LIMIT = 10
const APP_URL = process.env.WEBAPP_URL || 'app.gettrueflow.com'

export async function handleMessage(body: TwilioWebhookBody): Promise<string> {
  const phoneNumber = body.From.replace('whatsapp:', '')
  const messageText = body.Body?.trim() || ''
  const hasImage = parseInt(body.NumMedia) > 0
  const imageUrl = body.MediaUrl0
  const imageType = body.MediaContentType0

  // Step 1: Resolve user
  const user = await getOrCreateUser(phoneNumber)
  if (!user) {
    return buildTextResponse('Sorry, I could not set up your account. Please try again.')
  }

  // Step 2: Welcome new users
  const newUser = await isNewUser(phoneNumber)
  if (newUser) {
    await markUserNotNew(phoneNumber)
    const welcome = await getWelcomeMessage(user.full_name)
    return buildTextResponse(welcome)
  }

  // Step 3: Handle image — SINGLE Claude Vision call covers detection + extraction
  let scannedReceipt: any = null

  if (hasImage && imageUrl) {
    if (imageType && !imageType.startsWith('image/')) {
      return buildTextResponse('Please send a photo of your receipt or payment proof. I can only scan images.')
    }

    const analysis = await analyzeImage(imageUrl)

    if (!analysis) {
      return buildTextResponse(
        `I had trouble reading that image. Try a clearer photo, or add the details manually at *${APP_URL}/receipts*`
      )
    }

    // Incoming client payment → Smart Transfer Recognition
    if (analysis.direction === 'incoming') {
      return buildTextResponse(await handleIncomingPayment(analysis, user))
    }

    // Direction unknown → ask the user to clarify
    if (analysis.direction === 'unknown') {
      return buildTextResponse(
        `❓ I can see a financial image but I'm not sure which direction the money went.\n\n` +
        `Is this:\n• *1* — Money you *received* from a client (income)\n• *2* — An *expense* you paid\n\n` +
        `Reply 1 or 2, or add it manually at *${APP_URL}*`
      )
    }

    // Outgoing expense → check limit, save, pass to AI for commentary
    if (user.plan === 'free') {
      const count = await getMonthlyReceiptCount(user.org_id)
      if (count >= FREE_TIER_LIMIT) {
        return buildTextResponse(
          `⚠️ You've reached your *${FREE_TIER_LIMIT} receipt limit* for this month on the Free plan.\n\nUpgrade for unlimited receipts: ${process.env.PRICING_PAGE_URL || 'gettrueflow.com/pricing'}`
        )
      }
    }

    scannedReceipt = await saveFromAnalysis(analysis, user.org_id, user.user_id, user.currency)

    // If key fields are missing, reply immediately rather than sending through AI
    if (scannedReceipt) {
      const missingNote = buildMissingFieldsNote(analysis)
      if (missingNote) {
        // Return quick confirmation so we don't hit the timeout — AI commentary is skipped
        const vendor = analysis.vendor_name || 'Unknown vendor'
        const amount = analysis.amount
          ? `${user.currency} ${Number(analysis.amount).toLocaleString()}`
          : 'unknown amount'
        return buildTextResponse(
          `✅ *Receipt logged!*\n\n` +
          `Vendor: ${vendor}\nAmount: ${amount}\nCategory: ${analysis.category}` +
          missingNote
        )
      }
    } else {
      return buildTextResponse(
        `I had trouble saving that receipt. Please try again or add it at *${APP_URL}/receipts*`
      )
    }
  }

  // Step 4: Get AI response with full context (text messages + clean expense receipts)
  const { reply, actions } = await getAIResponse({
    phoneNumber,
    orgId: user.org_id,
    orgName: user.org_name,
    userName: user.full_name,
    userMessage: messageText,
    currency: user.currency,
    plan: user.plan,
    scannedReceipt
  })

  // Step 5: Execute any actions Claude detected
  if (actions.length > 0) {
    const notifications = await executeActions(actions, user)
    if (notifications.length > 0) {
      const combined = [reply, ...notifications].filter(Boolean).join('\n\n')
      return buildTextResponse(combined)
    }
  }

  return buildTextResponse(reply)
}
