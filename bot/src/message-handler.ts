// message-handler.ts
// Orchestrates the full message handling flow for every incoming WhatsApp message.
// Images are downloaded ONCE and analyzed in a SINGLE Claude Vision call to avoid
// Twilio's 15-second webhook timeout. Direction determines whether the image is
// an incoming client payment or an outgoing expense.
//
// Permission gate order (must not change):
//   1. Organization suspended
//   2. whatsapp_active revoked
//   3. Viewer role (read-only, no submissions)

import { getOrCreateUser, isNewUser, markUserNotNew, getMonthlyReceiptCount, findPendingInvite } from './user-service'
import { analyzeImage, buildMissingFieldsNote } from './image-analyzer'
import { handleIncomingPayment } from './smart-transfer'
import { saveFromAnalysis } from './receipt-scanner'
import { getAIResponse } from './ai-assistant'
import { executeActions } from './action-executor'
import { buildTextResponse } from './twiml-builder'
import { getSetupState, continueGuidedSetup } from './client-setup-service'
import { maybeGetLinkPrompt, maybeGetOnboardingLinkPrompt, handleMergeReply } from './merge-service'
import { startOnboarding, handleOnboardingReply, completeOnboarding } from './onboarding-service'
import { saveBusinessCardLead } from './business-card-service'
import { supabase } from './supabase'
import { TwilioWebhookBody } from '../types'

const FREE_TIER_LIMIT = 10
const APP_URL = process.env.WEBAPP_URL || 'app.trueflow.com'

export async function handleMessage(body: TwilioWebhookBody): Promise<string> {
  const phoneNumber = body.From.replace('whatsapp:', '')
  const messageText = body.Body?.trim() || ''
  const hasImage = parseInt(body.NumMedia) > 0
  const imageUrl = body.MediaUrl0
  const imageType = body.MediaContentType0

  // ── Step 12: Handle "START" before normal onboarding ────────────────────
  // If this phone number has a pending team invite and the message is START,
  // link them to the invite rather than creating a new owner account.
  if (messageText.toUpperCase() === 'START') {
    const pendingInvite = await findPendingInvite(phoneNumber)
    if (pendingInvite) {
      const org = pendingInvite.organizations as any

      // Create a profile if one doesn't exist for this number
      let { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phoneNumber)
        .single()

      if (!existingProfile) {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ phone: phoneNumber, full_name: null })
          .select()
          .single()
        existingProfile = newProfile
      }

      if (existingProfile) {
        // Link the profile to the pending org_members row
        await supabase
          .from('org_members')
          .update({
            user_id: existingProfile.id,
            joined_at: new Date().toISOString(),
            invite_token: null,
            invite_expires_at: null,
          })
          .eq('id', pendingInvite.id)

        // Create a WhatsApp session
        await supabase.from('whatsapp_sessions').insert({
          phone_number: phoneNumber,
          org_id: pendingInvite.org_id,
          user_id: existingProfile.id,
          is_new: false,
        })

        return buildTextResponse(
          `✅ You're in! Welcome to *${org?.name || 'the team'}*.\n\n` +
          `You can now send receipts and I'll log them straight to the business account.\n\n` +
          `Go ahead and send your first receipt whenever you're ready.`
        )
      }
    }
  }

  // ── Step 1: Resolve user ─────────────────────────────────────────────────
  const user = await getOrCreateUser(phoneNumber)
  if (!user) {
    return buildTextResponse('Sorry, I could not set up your account. Please try again.')
  }

  // ── Permission Gate 1: Organization suspended ────────────────────────────
  if (user.org_status === 'suspended') {
    return buildTextResponse(
      '⚠️ Your account is currently paused.\nContact support@trueflow.com for help.'
    )
  }

  // ── Permission Gate 2: WhatsApp access revoked ───────────────────────────
  if (!user.whatsapp_active) {
    return buildTextResponse(
      "You don't currently have WhatsApp access for this account.\n" +
      'Ask your account owner to enable it in their team settings.'
    )
  }

  // ── Permission Gate 3: Viewer role ───────────────────────────────────────
  if (user.role === 'viewer') {
    return buildTextResponse(
      'Your account has view-only access.\n' +
      "You can check summaries but can't submit receipts or make changes via WhatsApp."
    )
  }

  // Build permission context to pass to AI
  const userPermissions = {
    canSeeClients: user.can_see_clients || ['owner', 'admin'].includes(user.role),
    canSeeIncome: user.can_see_income || ['owner', 'admin'].includes(user.role),
    canExport: user.can_export || ['owner', 'admin'].includes(user.role),
    isOwnerOrAdmin: ['owner', 'admin'].includes(user.role),
  }

  // ── Step 2: Start conversational onboarding for brand-new users ─────────
  // Exactly 2 questions (name, then business/family/personal), never more,
  // never before this point — see the Seamless Onboarding Flow business
  // rules in CLAUDE.md.
  const newUser = await isNewUser(phoneNumber)
  if (newUser) {
    await markUserNotNew(phoneNumber)
    const firstMessage = await startOnboarding(phoneNumber)
    return buildTextResponse(firstMessage)
  }

  // ── Step 2a: Mid-onboarding name/type questions ──────────────────────────
  // Only short-circuits while awaiting the name or type answer. Once
  // onboarding reaches awaiting_first_action, this is a no-op and the
  // message falls through to the real image/AI handling below.
  const onboardingResult = await handleOnboardingReply(phoneNumber, messageText, hasImage, user.org_id, user.user_id)
  if (onboardingResult.handled) return buildTextResponse(onboardingResult.reply!)
  const onboardingStepBefore = onboardingResult.step

  // ── Step 2b: Identity-merge conversation (post-onboarding, optional) ─────
  // Watches for an email reply to the one-time link offer, or the 6-digit
  // verification code. Anything else falls through to normal routing.
  if (!hasImage && messageText) {
    const mergeReply = await handleMergeReply(phoneNumber, messageText, user)
    if (mergeReply) return buildTextResponse(mergeReply)
  }

  // ── Step 3: Handle image — SINGLE Claude Vision call ─────────────────────
  let scannedReceipt: any = null
  let pendingLinkPrompt: string | null = null

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

    if (analysis.content_type === 'business_card') {
      const lead = await saveBusinessCardLead(user.org_id, {
        contact_name: analysis.contact_name,
        contact_company: analysis.contact_company,
        contact_role: analysis.contact_role,
        contact_phone: analysis.contact_phone,
        contact_email: analysis.contact_email,
      })

      if (!lead) {
        return buildTextResponse(
          `I can see a business card but couldn't read a name clearly. Try a clearer photo, or add the contact manually at *${APP_URL}/clients*`
        )
      }

      const wasOnboarding = onboardingStepBefore === 'awaiting_first_action'
      if (wasOnboarding) await completeOnboarding(phoneNumber)
      const cardLinkPrompt = wasOnboarding ? await maybeGetOnboardingLinkPrompt(phoneNumber) : null

      return buildTextResponse(
        `Got it! Saved *${lead.name}*${lead.company ? ` from *${lead.company}*` : ''} as a new lead 🪪\n\n` +
        `Want me to set a follow-up reminder? Just say when, like 'remind me in 3 days.'` +
        (cardLinkPrompt ? `\n\n${cardLinkPrompt}` : '')
      )
    }

    if (analysis.direction === 'incoming') {
      if (!userPermissions.canSeeClients) {
        return buildTextResponse(
          '📥 I can see a payment proof, but your account doesn\'t have access to client income tracking.\n' +
          'Ask your account owner to enable client visibility for your account.'
        )
      }
      return buildTextResponse(await handleIncomingPayment(analysis, user))
    }

    if (analysis.direction === 'unknown') {
      return buildTextResponse(
        `❓ I can see a financial image but I'm not sure which direction the money went.\n\n` +
        `Is this:\n• *1* — Money you *received* from a client (income)\n• *2* — An *expense* you paid\n\n` +
        `Reply 1 or 2, or add it manually at *${APP_URL}*`
      )
    }

    // Outgoing expense — check free tier limit
    if (user.plan === 'free') {
      const count = await getMonthlyReceiptCount(user.org_id)
      if (count >= FREE_TIER_LIMIT) {
        return buildTextResponse(
          `⚠️ You've reached your *${FREE_TIER_LIMIT} receipt limit* for this month on the Free plan.\n\nUpgrade for unlimited receipts: ${process.env.PRICING_PAGE_URL || 'trueflow.com/pricing'}`
        )
      }
    }

    scannedReceipt = await saveFromAnalysis(analysis, user.org_id, user.user_id, user.currency)

    if (scannedReceipt) {
      if (onboardingStepBefore === 'awaiting_first_action') await completeOnboarding(phoneNumber)

      // Optional account-link offer — fires exactly once, only after the
      // FIRST receipt scan (the onboarding aha moment), per identity spec
      const linkPrompt = await maybeGetLinkPrompt(user, phoneNumber)

      const missingNote = buildMissingFieldsNote(analysis)
      if (missingNote) {
        const vendor = analysis.vendor_name || 'Unknown vendor'
        const amount = analysis.amount
          ? `${user.currency} ${Number(analysis.amount).toLocaleString()}`
          : 'unknown amount'
        return buildTextResponse(
          `✅ *Receipt logged!*\n\n` +
          `Vendor: ${vendor}\nAmount: ${amount}\nCategory: ${analysis.category}` +
          missingNote +
          (linkPrompt ? `\n\n${linkPrompt}` : '')
        )
      }
      if (linkPrompt) {
        // Attach the one-time offer to the scan confirmation the AI sends
        pendingLinkPrompt = linkPrompt
      }
    } else {
      return buildTextResponse(
        `I had trouble saving that receipt. Please try again or add it at *${APP_URL}/receipts*`
      )
    }
  }

  // ── Step 4a: Mid-guided-setup routing ────────────────────────────────────
  if (!hasImage) {
    const setupState = await getSetupState(phoneNumber)
    if (setupState) {
      const { reply: setupReply, done } = await continueGuidedSetup(
        phoneNumber,
        messageText,
        setupState
      )
      if (setupReply) return buildTextResponse(setupReply)
    }
  }

  // ── Step 4: Get AI response ───────────────────────────────────────────────
  const { reply, actions } = await getAIResponse({
    phoneNumber,
    orgId: user.org_id,
    orgName: user.org_name,
    userName: user.full_name,
    userMessage: messageText,
    currency: user.currency,
    plan: user.plan,
    defaultTaxCountry: user.default_tax_country,
    scannedReceipt,
    userPermissions,
  })

  // Onboarding's first real action wasn't a receipt or business card (most
  // commonly a reminder) — this AI turn is the aha moment, so close out
  // onboarding and offer the one-time account-link prompt here too.
  let onboardingLinkPrompt: string | null = null
  if (onboardingStepBefore === 'awaiting_first_action') {
    await completeOnboarding(phoneNumber)
    onboardingLinkPrompt = await maybeGetOnboardingLinkPrompt(phoneNumber)
  }

  // ── Step 5: Execute any actions Claude detected ───────────────────────────
  if (actions.length > 0) {
    const notifications = await executeActions(actions, user)
    if (notifications.length > 0) {
      const combined = [reply, ...notifications, pendingLinkPrompt, onboardingLinkPrompt].filter(Boolean).join('\n\n')
      return buildTextResponse(combined)
    }
  }

  const finalReply = [reply, pendingLinkPrompt, onboardingLinkPrompt].filter(Boolean).join('\n\n')
  return buildTextResponse(finalReply)
}
