// api/auth/signup/route.ts
// Server-side signup using service role key — bypasses RLS.
// Creates auth user + profile + org + org_members atomically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLAN_CONFIG, TRIAL_DAYS } from '@/lib/plans'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, businessName, inviteOrgId, inviteRole, orgType } =
      await req.json() as {
        email: string
        password: string
        fullName: string
        businessName?: string
        inviteOrgId?: string
        inviteRole?: string
        orgType?: string
      }

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Create the auth user (email_confirm: true skips the confirmation email requirement)
    const { data: { user }, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError || !user) {
      console.error('signup: createUser failed:', createError)
      const msg = createError?.message?.includes('already registered')
        ? 'An account with this email already exists.'
        : createError?.message ?? 'Could not create account.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const userId = user.id

    // Create profile
    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: userId, full_name: fullName })

    if (profileError) {
      console.error('signup: profile insert failed:', profileError)
      return NextResponse.json({ error: 'Could not create profile.' }, { status: 500 })
    }

    if (inviteOrgId) {
      // Join an existing org via invite
      await admin.from('org_members').insert({
        org_id: inviteOrgId,
        user_id: userId,
        role: inviteRole ?? 'staff',
        joined_at: new Date().toISOString(),
      })
    } else {
      // Create a new org and make this user the owner — starts on the
      // 14-day free_trial (full access, no card required); a scheduled
      // job (bot/src/trial-service.ts) transitions it to 'free' if it
      // isn't upgraded before trial_ends_at.
      const orgName = businessName?.trim() || `${fullName}'s Business`
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { data: org, error: orgError } = await admin
        .from('organizations')
        .insert({
          name: orgName,
          owner_id: userId,
          plan: 'free_trial',
          trial_ends_at: trialEndsAt,
          type: orgType ?? 'sme',
          receipt_limit: PLAN_CONFIG.free_trial.receiptLimit,
          client_limit: PLAN_CONFIG.free_trial.clientLimit,
        })
        .select()
        .single()

      if (orgError || !org) {
        console.error('signup: org insert failed:', orgError)
        return NextResponse.json({ error: 'Could not create organisation.' }, { status: 500 })
      }

      await admin.from('org_members').insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner',
        joined_at: new Date().toISOString(),
      })
    }

    // Generate a magic link so the client can sign in immediately
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.gettrueflow.com'
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/auth/callback` },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('signup: generateLink failed:', linkError)
      return NextResponse.json({ error: 'Account created but could not generate sign-in link. Please log in manually.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, redirect: linkData.properties.action_link })
  } catch (err) {
    console.error('signup: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
