// onboarding-service.ts
// Conversational first-contact onboarding: name -> business/family/personal
// -> capability list -> first real action (receipt, reminder, or business
// card). Exactly 2 questions, always, before the first aha moment — never
// more, and never anything before the first question either.
//
// State lives on whatsapp_sessions.onboarding_step:
//   'awaiting_name' -> 'awaiting_type' -> 'awaiting_first_action' -> null (done)

import { supabase } from './supabase'

export type OnboardingStep = 'awaiting_name' | 'awaiting_type' | 'awaiting_first_action'

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
  await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_first_action' }).eq('phone_number', phoneNumber)

  return {
    handled: true,
    step,
    reply:
      `Here's what we can do together:\n${capabilityList(type === 'sme')}\n\n` +
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
