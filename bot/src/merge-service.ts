// merge-service.ts
// Cross-Channel Identity Merge (Flow 1): lets a WhatsApp user voluntarily
// link a web (email) account after onboarding's aha moment. Implements the
// optional one-time prompt, email verification codes (10 min, 3 attempts),
// merge logic (earliest created_at wins, org_members reassigned, secondary
// soft-marked via merged_into_id), and confirmation on both channels.
// Never asks before the first receipt scan; never merges unverified claims.

import { supabase } from './supabase'
import { UserContext } from '../types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const CODE_RE = /^\d{6}$/
const MAX_ATTEMPTS = 3

const LINK_PROMPT =
  'Already using TrueFlow on the web? Reply with your email to link your accounts, or just keep chatting to get started here.'

// ── Optional one-time prompt after the first receipt scan ────────────────
// Fires only when this org just logged its FIRST receipt and this session
// has never been prompted. Returns the prompt text or null.
export async function maybeGetLinkPrompt(user: UserContext, phoneNumber: string): Promise<string | null> {
  try {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('merge_prompted')
      .eq('phone_number', phoneNumber)
      .maybeSingle()

    if (!session || session.merge_prompted) return null

    const { count } = await supabase
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', user.org_id)
    if ((count ?? 0) !== 1) return null // only right after the FIRST scan

    await supabase
      .from('whatsapp_sessions')
      .update({ merge_prompted: true, merge_state: 'offered' })
      .eq('phone_number', phoneNumber)

    return LINK_PROMPT
  } catch (err) {
    console.error('maybeGetLinkPrompt failed:', err)
    return null
  }
}

// ── Generalized one-time prompt for onboarding completions that are NOT a
// receipt scan (business card lead, reminder set, etc). Same one-time gate
// (merge_prompted) as the receipt-triggered version above — whichever
// completion happens first is the only one that ever prompts.
export async function maybeGetOnboardingLinkPrompt(phoneNumber: string): Promise<string | null> {
  try {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('merge_prompted')
      .eq('phone_number', phoneNumber)
      .maybeSingle()

    if (!session || session.merge_prompted) return null

    await supabase
      .from('whatsapp_sessions')
      .update({ merge_prompted: true, merge_state: 'offered' })
      .eq('phone_number', phoneNumber)

    return LINK_PROMPT
  } catch (err) {
    console.error('maybeGetOnboardingLinkPrompt failed:', err)
    return null
  }
}

// ── Email sending (Resend — same service the web app uses for invites) ───
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.error('merge-service: RESEND_API_KEY not set — cannot send verification email')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TrueFlow <hello@verify.gettrueflow.com>',
        to,
        subject,
        html,
      }),
    })
    return res.ok
  } catch (err) {
    console.error('merge-service: sendEmail failed:', err)
    return false
  }
}

// ── Look up a web account by email via the GoTrue admin API ──────────────
// Emails live in auth.users, not profiles. Small user base → paging is fine.
async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const base = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return null
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { users?: { id: string; email?: string }[] }
    const users: { id: string; email?: string }[] = json.users ?? []
    const hit = users.find(u => (u.email ?? '').toLowerCase() === target)
    if (hit) return { id: hit.id, email: hit.email! }
    if (users.length < 200) break
  }
  return null
}

// ── Main conversational entry: handle replies while a merge is pending ───
// Returns a reply string to send, or null to let normal routing continue.
export async function handleMergeReply(
  phoneNumber: string,
  messageText: string,
  user: UserContext
): Promise<string | null> {
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('merge_state, merge_target_profile_id, merge_attempts')
    .eq('phone_number', phoneNumber)
    .maybeSingle()

  if (!session?.merge_state) return null
  const text = messageText.trim()

  // ── State: offered — watching for an email reply ───────────────────────
  if (session.merge_state === 'offered') {
    if (!EMAIL_RE.test(text)) {
      // User ignored the offer — close it silently, never re-prompt
      await clearMergeState(phoneNumber)
      return null
    }

    const authUser = await findAuthUserByEmail(text)
    if (!authUser) {
      await clearMergeState(phoneNumber)
      return "I couldn't find an account with that email, no problem, you can always link one later from Settings on the web app."
    }

    // The web profile id equals the auth user id
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id, merged_into_id, status')
      .eq('id', authUser.id)
      .maybeSingle()

    if (!targetProfile || targetProfile.status === 'merged' || targetProfile.id === user.user_id) {
      await clearMergeState(phoneNumber)
      return "I couldn't find an account with that email, no problem, you can always link one later from Settings on the web app."
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const { error: codeErr } = await supabase.from('identity_merge_codes').insert({
      target_profile_id: targetProfile.id,
      code,
      channel: 'email',
      requested_by_profile_id: user.user_id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (codeErr) {
      console.error('merge-service: code insert failed:', codeErr)
      await clearMergeState(phoneNumber)
      return 'Something went wrong setting up the link. Please try again later from Settings on the web app.'
    }

    const sent = await sendEmail(
      authUser.email,
      'Your TrueFlow account link code',
      `<p>Someone (hopefully you) asked to link this TrueFlow web account with a WhatsApp number.</p>
       <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>
       <p>This code expires in 10 minutes. If this wasn't you, you can ignore this email — nothing changes without the code.</p>`
    )
    if (!sent) {
      await clearMergeState(phoneNumber)
      return "I couldn't send a verification email right now. Please try again later from Settings on the web app."
    }

    await supabase
      .from('whatsapp_sessions')
      .update({ merge_state: 'awaiting_code', merge_target_profile_id: targetProfile.id, merge_attempts: 0 })
      .eq('phone_number', phoneNumber)

    return "I found an account with that email. I've sent a code there to confirm it's really you. What's the code?"
  }

  // ── State: awaiting_code — watching for the 6-digit code ──────────────
  if (session.merge_state === 'awaiting_code') {
    if (!CODE_RE.test(text)) return null // not a code — let normal chat continue

    const targetId = session.merge_target_profile_id
    const { data: codeRow } = await supabase
      .from('identity_merge_codes')
      .select('id, code, expires_at, used_at')
      .eq('target_profile_id', targetId)
      .eq('channel', 'email')
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const valid = codeRow && codeRow.code === text && new Date(codeRow.expires_at) > new Date()

    if (!valid) {
      const attempts = (session.merge_attempts ?? 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        await clearMergeState(phoneNumber)
        return "That didn't match, you can try again later from Settings on the web app."
      }
      await supabase
        .from('whatsapp_sessions')
        .update({ merge_attempts: attempts })
        .eq('phone_number', phoneNumber)
      return `That code didn't match. You have ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left.`
    }

    // Verified — perform the merge
    await supabase.from('identity_merge_codes').update({ used_at: new Date().toISOString() }).eq('id', codeRow!.id)
    const merged = await performMerge(user.user_id, targetId, phoneNumber)
    await clearMergeState(phoneNumber)

    if (!merged) {
      return 'The verification worked, but something went wrong completing the link. Please contact support@gettrueflow.com and we will sort it out.'
    }

    // Email confirmation (best-effort)
    const authUser = await findAuthUserById(targetId)
    if (authUser?.email) {
      sendEmail(
        authUser.email,
        'Your TrueFlow accounts have been linked',
        '<p>Your TrueFlow accounts have been linked. You can now access your data from WhatsApp or the web with either method.</p>'
      ).catch(() => {})
    }

    return '✅ Your accounts are linked! You can now log in on web with this number\'s OTP or your email.'
  }

  return null
}

async function findAuthUserById(id: string): Promise<{ id: string; email?: string } | null> {
  const base = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return null
  const res = await fetch(`${base}/auth/v1/admin/users/${id}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return null
  return (await res.json()) as { id: string; email?: string }
}

async function clearMergeState(phoneNumber: string) {
  await supabase
    .from('whatsapp_sessions')
    .update({ merge_state: null, merge_target_profile_id: null, merge_attempts: 0 })
    .eq('phone_number', phoneNumber)
}

// ── Merge logic — earliest created_at wins as primary ────────────────────
// Primary implementation is the SHARED perform_identity_merge Postgres
// function (also used by the web app's Flow 2), so the two channels can
// never diverge. The local TS logic below is kept only as a fallback for
// environments where the SQL function has not been created yet.
async function performMerge(waProfileId: string, webProfileId: string, phoneNumber: string): Promise<boolean> {
  const { error: rpcError } = await supabase.rpc('perform_identity_merge', {
    profile_a: waProfileId,
    profile_b: webProfileId,
  })
  if (!rpcError) {
    // Point this WhatsApp session at whichever profile is now primary
    const { data: me } = await supabase
      .from('profiles')
      .select('merged_into_id')
      .eq('id', waProfileId)
      .maybeSingle()
    const primaryId = me?.merged_into_id ?? waProfileId
    await supabase
      .from('whatsapp_sessions')
      .update({ user_id: primaryId })
      .eq('phone_number', phoneNumber)
    return true
  }
  console.warn('performMerge: shared RPC unavailable, using local fallback:', rpcError.message)

  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, phone, created_at')
      .in('id', [waProfileId, webProfileId])
    if (!profiles || profiles.length !== 2) return false

    const [a, b] = profiles
    const primary = new Date(a.created_at) <= new Date(b.created_at) ? a : b
    const secondary = primary.id === a.id ? b : a

    // Reassign the secondary's org memberships to the primary.
    // unique(org_id, user_id) can collide if both belonged to the same org —
    // soft-remove the secondary's row in that case.
    const { data: secondaryMemberships } = await supabase
      .from('org_members')
      .select('id, org_id')
      .eq('user_id', secondary.id)

    for (const m of secondaryMemberships ?? []) {
      const { data: existing } = await supabase
        .from('org_members')
        .select('id')
        .eq('org_id', m.org_id)
        .eq('user_id', primary.id)
        .maybeSingle()

      if (existing) {
        await supabase.from('org_members').update({ removed_at: new Date().toISOString() }).eq('id', m.id)
      } else {
        const { error } = await supabase.from('org_members').update({ user_id: primary.id }).eq('id', m.id)
        if (error) console.error('performMerge: org_members reassign failed:', error)
      }
    }

    // Copy the missing identity field onto the primary (phone lives on
    // profiles; email lives in auth.users and resolves via merged_into_id)
    if (!primary.phone && secondary.phone) {
      await supabase.from('profiles').update({ phone: secondary.phone }).eq('id', primary.id)
    }

    // Soft-mark the secondary — never hard delete
    const { error: markErr } = await supabase
      .from('profiles')
      .update({ merged_into_id: primary.id, status: 'merged' })
      .eq('id', secondary.id)
    if (markErr) {
      console.error('performMerge: mark merged failed:', markErr)
      return false
    }

    // Point the WhatsApp session at the primary so every future message
    // resolves to the merged account immediately
    await supabase
      .from('whatsapp_sessions')
      .update({ user_id: primary.id })
      .eq('phone_number', phoneNumber)

    return true
  } catch (err) {
    console.error('performMerge failed:', err)
    return false
  }
}

// ── Login resolution: follow merged_into_id to the primary profile ───────
export async function resolveMergedProfileId(profileId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('merged_into_id')
    .eq('id', profileId)
    .maybeSingle()
  return data?.merged_into_id ?? profileId
}
