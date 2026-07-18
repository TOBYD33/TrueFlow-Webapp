// onboarding-service.ts
// Conversational first-contact onboarding: name -> business/family/personal
// -> [business name, business accounts only] -> capability list -> first
// real action (receipt, reminder, or business card). Exactly 2 questions
// for family/personal accounts, always, before the first aha moment.
// Business accounts get one extra, conditional question — their business
// name — since organizations.name otherwise stays the onboarding
// placeholder forever with no other point where it's ever captured.
//
// State lives on whatsapp_sessions.onboarding_step:
//   'awaiting_name' -> 'awaiting_type' -> ['awaiting_business_name' ->]
//   'awaiting_first_action' -> null (done)

import crypto from 'crypto'
import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'

export type OnboardingStep = 'awaiting_name' | 'awaiting_type' | 'awaiting_business_name' | 'awaiting_first_action'

export interface OnboardingResult {
  reply: string | null   // what to send back; null when not handled here
  handled: boolean       // true if this message was fully consumed by onboarding
  step: OnboardingStep | null // the step as observed for THIS message
}

export async function getOnboardingStep(phoneNumber: string): Promise<OnboardingStep | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('onboarding_step')
    .eq('phone_number', phoneNumber)
    .maybeSingle()
  return (data?.onboarding_step as OnboardingStep) ?? null
}

export async function startOnboarding(phoneNumber: string): Promise<string> {
  await supabase
    .from('whatsapp_sessions')
    .update({ onboarding_step: 'awaiting_name' })
    .eq('phone_number', phoneNumber)

  return "Hey! I'm TrueFlow 👋\nWhat should I call you?"
}

function capabilityList(includeBusinessCard: boolean): string {
  const lines = [
    '📷 Scan receipts, just send a photo',
    '💰 Track client payments',
    '📊 Set budgets by category, like a Budget for Family Trip',
    '⏰ Reminders for bills, deadlines, even birthdays',
    '🗂️ Manage clients and projects',
  ]
  if (includeBusinessCard) lines.push('🪪 Scan a business card to save a new lead automatically')
  return lines.join('\n')
}

// Handles the name/type questions only. Returns handled:false (and does
// nothing) once onboarding reaches awaiting_first_action or has finished,
// so the caller falls through to normal image/AI handling.
export async function handleOnboardingReply(
  phoneNumber: string,
  messageText: string,
  hasImage: boolean,
  orgId: string,
  userId: string
): Promise<OnboardingResult> {
  const step = await getOnboardingStep(phoneNumber)
  if (!step || step === 'awaiting_first_action') {
    return { reply: null, handled: false, step }
  }

  if (step === 'awaiting_name') {
    if (hasImage || !messageText.trim()) {
      return { handled: true, step, reply: "Before we dive in — what should I call you?" }
    }
    const name = messageText.trim().slice(0, 80)

    await supabase.from('profiles').update({ full_name: name }).eq('id', userId)
    await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_type' }).eq('phone_number', phoneNumber)

    return {
      handled: true,
      step,
      reply: `Nice to meet you, ${name}! Quick one, is this for your business, your family, or just you?`,
    }
  }

  if (step === 'awaiting_business_name') {
    if (hasImage || !messageText.trim()) {
      return { handled: true, step, reply: 'What should I call your business? (just the name is fine)' }
    }
    const businessName = messageText.trim().slice(0, 120)

    await supabase.from('organizations').update({ name: businessName }).eq('id', orgId)
    await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_first_action' }).eq('phone_number', phoneNumber)

    return {
      handled: true,
      step,
      reply:
        `${businessName} ✅\n\nHere's what we can do together:\n${capabilityList(true)}\n\n` +
        `Let's try it. Got a receipt handy? Send a photo.\n\n` +
        `No receipt nearby? Tell me something to remind you about instead, like 'remind me to pay rent Friday.'`,
    }
  }

  // step === 'awaiting_type'
  if (hasImage) {
    return { handled: true, step, reply: 'Just one more thing first — is this for your business, your family, or just you?' }
  }

  const lower = messageText.toLowerCase()
  let type: 'sme' | 'family' | 'individual' | null = null
  if (/^1\b/.test(lower) || /\b(biz|business|work|company|shop|store)\b/.test(lower)) type = 'sme'
  else if (/^2\b/.test(lower) || /\b(family|household|home)\b/.test(lower)) type = 'family'
  else if (/^3\b/.test(lower) || /\b(just me|myself|personal|me only|individual)\b/.test(lower)) type = 'individual'

  if (!type) {
    return {
      handled: true,
      step,
      reply: 'Sorry, just to be clear — is this for your *business*, your *family*, or *just you*?',
    }
  }

  await supabase.from('organizations').update({ type }).eq('id', orgId)

  // Business accounts get one more question before the capability list —
  // organizations.name otherwise never gets captured anywhere else.
  if (type === 'sme') {
    await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_business_name' }).eq('phone_number', phoneNumber)
    return {
      handled: true,
      step,
      reply: `Got it! What should I call your business?`,
    }
  }

  await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_first_action' }).eq('phone_number', phoneNumber)

  return {
    handled: true,
    step,
    reply:
      `Here's what we can do together:\n${capabilityList(false)}\n\n` +
      `Let's try it. Got a receipt handy? Send a photo.\n\n` +
      `No receipt nearby? Tell me something to remind you about instead, like 'remind me to pay rent Friday.'`,
  }
}

export async function completeOnboarding(phoneNumber: string): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ onboarding_step: null })
    .eq('phone_number', phoneNumber)
}

// ── Post-aha-moment follow-ups: magic link, THEN a separate email offer ──
// Two distinct WhatsApp messages, sent via the REST API (not appended to
// the aha-moment confirmation), exactly per the finalized onboarding spec's
// business rule 3. Fires once per new onboarding — call this only right
// after completeOnboarding(), from whichever of the three first-action
// paths got there first.
async function generateMagicToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex')
  await supabase.from('magic_login_tokens').insert({
    token,
    user_id: userId,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })
  return token
}

export async function sendPostOnboardingFollowUps(phoneNumber: string, userId: string): Promise<void> {
  try {
    const appUrl = process.env.WEBAPP_URL || 'app.gettrueflow.com'
    const token = await generateMagicToken(userId)

    await sendWhatsAppMessage(
      phoneNumber,
      `Want to see all this on the web too? Tap below, no password needed, this link logs you straight in:\n` +
      `${appUrl}/login?token=${token}\n(Expires in 15 minutes for your security.)\n\n` +
      `Everything we just did here is already waiting for you there.`
    )

    // Separate message, separate state — the finalized onboarding email
    // step (save directly if new, verify-and-merge if it matches an
    // existing account), distinct from the standalone 'offered' prompt.
    await supabase
      .from('whatsapp_sessions')
      .update({ merge_state: 'onboarding_email' })
      .eq('phone_number', phoneNumber)

    await sendWhatsAppMessage(
      phoneNumber,
      `One more thing, want to add your email? It helps if you ever want your invoices or monthly summaries sent there. Totally optional, just reply with it or skip.`
    )
  } catch (err) {
    console.error('sendPostOnboardingFollowUps failed:', err)
  }
}
