// message-handler.ts
// Orchestrates the full message handling flow for every incoming WhatsApp message.
// Routes image vs text, checks limits, calls AI, executes actions, sends reply.

import { getOrCreateUser, isNewUser, markUserNotNew, getMonthlyReceiptCount } from './user-service'
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

  // Step 3: Handle image (receipt scan)
  let scannedReceipt: any = null
  if (hasImage && imageUrl) {
    // Check receipt limit for free tier
    if (user.plan === 'free') {
      const count = await getMonthlyReceiptCount(user.org_id)
      if (count >= FREE_TIER_LIMIT) {
        const msg = `⚠️ You've reached your *${FREE_TIER_LIMIT} receipt limit* for this month on the Free plan.\n\nUpgrade to Solo (₦3,000/mo) for unlimited receipts.\n\n${process.env.PRICING_PAGE_URL || 'trueflio.com/pricing'}`
        return buildTextResponse(msg)
      }
    }

    // Check if it's actually an image
    if (imageType && !imageType.startsWith('image/')) {
      return buildTextResponse('Please send a photo of your receipt. I can only scan images.')
    }

    scannedReceipt = await scanReceipt(imageUrl, user.org_id, user.user_id, user.currency)

    if (!scannedReceipt) {
      return buildTextResponse('I had trouble reading that receipt. Could you try sending a clearer photo?')
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
    // If SHOW_BUDGETS produced output, append it to the reply
    if (notifications.length > 0) {
      const combined = [reply, ...notifications].filter(Boolean).join('\n\n')
      return buildTextResponse(combined)
    }
  }

  return buildTextResponse(reply)
}
