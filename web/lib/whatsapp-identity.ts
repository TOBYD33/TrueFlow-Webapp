// lib/whatsapp-identity.ts
// Shared "find or create a real Supabase Auth account for a bot-created
// profile" logic. Bot-created profiles (from WhatsApp-first onboarding)
// are plain `profiles` rows with NO matching `auth.users` row — only a web
// login (OTP or magic link) actually mints the auth account. Used by both
// the OTP verify route and the onboarding magic-link route so the two can
// never resolve a phone/profile to two different auth identities.

import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface ResolvedAuthUser {
  email: string
  isNewUser: boolean
}

// Given a bot-side profile id (and its phone/name for a first-time auth
// account), returns the email to sign in with — creating the auth account
// on first web login if one doesn't exist yet, and folding the old
// bot-created profile into the new auth-backed one via merged_into_id so
// every future lookup (bot, web, OTP, magic link) resolves consistently.
export async function resolveOrCreateAuthUserForProfile(
  profileId: string,
  phone: string | null,
  fullName: string | null
): Promise<ResolvedAuthUser> {
  const admin = getAdmin()

  // Follow merged_into_id if this profile was already folded into another
  const { data: mergeCheck } = await admin
    .from('profiles')
    .select('merged_into_id')
    .eq('id', profileId)
    .maybeSingle()
  const resolvedId = mergeCheck?.merged_into_id ?? profileId

  const { data: { user: existing } } = await admin.auth.admin.getUserById(resolvedId)
  if (existing?.email) {
    return { email: existing.email, isNewUser: false }
  }

  // No auth account yet — create one with a stable derived email
  const sanitizedPhone = (phone ?? resolvedId).replace(/[^0-9]/g, '') || resolvedId
  const derivedEmail = `wa_${sanitizedPhone}@trueflow.app`

  const { data: { user: newUser }, error: createError } = await admin.auth.admin.createUser({
    email: derivedEmail,
    email_confirm: true,
    user_metadata: { phone, full_name: fullName ?? '', source: 'whatsapp_signin' },
  })

  if (createError && !createError.message.toLowerCase().includes('already')) {
    throw new Error(`resolveOrCreateAuthUserForProfile: createUser failed: ${createError.message}`)
  }

  if (newUser && newUser.id !== resolvedId) {
    await admin.from('org_members').update({ user_id: newUser.id }).eq('user_id', resolvedId)
    await admin.from('whatsapp_sessions').update({ user_id: newUser.id }).eq('user_id', resolvedId)

    if (phone) await admin.from('profiles').update({ phone: null }).eq('id', resolvedId)
    const { data: newProfile } = await admin.from('profiles').select('id').eq('id', newUser.id).maybeSingle()
    if (newProfile) {
      await admin.from('profiles').update({ phone, full_name: fullName }).eq('id', newUser.id)
    } else {
      await admin.from('profiles').insert({ id: newUser.id, phone, full_name: fullName })
    }
    await admin.from('profiles').update({ merged_into_id: newUser.id, status: 'merged' }).eq('id', resolvedId)
  }

  return { email: derivedEmail, isNewUser: true }
}
