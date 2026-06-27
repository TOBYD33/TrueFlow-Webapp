// message-handler.ts
// Orchestrates the full message handling flow for every incoming WhatsApp message.
// Routes image vs text, detects incoming payment vs expense, calls AI, executes actions.

import { getOrCreateUser, isNewUser, markUserNotNew, getMonthlyReceiptCount } from './user-service'
import { detectTransfer } from './transfer-detector'
import { handleIncomingPayment } from './smart-transfer'
import { scanReceipt } from './receipt-scanner'
import { getAIResponse, getWelcomeMessage } from './ai-assistant'
import { executeActions } from './action-executor'
import { buildTextResponse } from './twiml-builder'
import { TwilioWebhookBody } from '../types'

const FREE_TIER_LIMIT = 10

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

  // Step 3: Handle image — detect direction before anything else
  let scannedReceipt: any = null

  if (hasImage && imageUrl) {
    if (imageType && !imageType.startsWith('image/')) {
      return buildTextResponse('Please send a photo of your receipt or payment proof. I can only scan images.')
    }

    // Detect whether this is an incoming client payment or an outgoing expense
    const transfer = await detectTransfer(imageUrl)

    if (transfer?.detection === 'incoming_payment') {
      // Smart Transfer Recognition — save to client_payments and reply immediately
      return buildTextResponse(await handleIncomingPayment(transfer, imageUrl, user))
    }

    // Outgoing expense or unrecognised image → standard receipt scan
    if (user.plan === 'free') {
      const count = await getMonthlyReceiptCount(user.org_id)
      if (count >= FREE_TIER_LIMIT) {
        return buildTextResponse(
          `⚠️ You've reached your *${FREE_TIER_LIMIT} receipt limit* for this month on the Free plan.\n\nUpgrade for unlimited receipts: ${process.env.PRICING_PAGE_URL || 'gettrueflow.com/pricing'}`
        )
      }
    }

    scannedReceipt = await scanReceipt(imageUrl, user.org_id, user.user_id, user.currency)

    if (!scannedReceipt) {
      return buildTextResponse('I had trouble reading that image. Could you try sending a clearer photo?')
    }
  }

  // Step 4: Get AI response with full context
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
