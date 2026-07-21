// api/clients/set-birthday/route.ts
// Sets a client's birthday and generates the three tiered reminders (1
// month, 1 week, 1 day before), recurring every year via the reminder
// system's existing 'yearly' recurrence — the scheduler already advances a
// yearly reminder's due_date by one year once it fires, so that recurrence
// value is the entire "regenerate next year" mechanism, no separate job.
// Mirrors bot/src/client-birthday-service.ts's logic exactly (see
// web/lib/timezone.ts's header comment for why it's duplicated, not shared).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { resolveTimezone, dateStrInTimezone, addDaysToDateStr, addMonthsToDateStr, nextOccurrenceOfDate } from '@/lib/timezone'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Upsert-by-intent, same rule as bot's setReminder: an active reminder with
// the same org+title+date is updated in place, never duplicated.
async function upsertReminder(admin: ReturnType<typeof getAdmin>, params: {
  orgId: string
  clientId: string
  title: string
  dueDate: string
}) {
  const { data: existing } = await admin
    .from('reminders')
    .select('id')
    .eq('org_id', params.orgId)
    .eq('due_date', params.dueDate)
    .eq('status', 'active')
    .ilike('title', params.title)
    .maybeSingle()

  if (existing) {
    await admin.from('reminders').update({ recurrence: 'yearly', category: 'custom', client_id: params.clientId }).eq('id', existing.id)
  } else {
    await admin.from('reminders').insert({
      org_id: params.orgId,
      client_id: params.clientId,
      title: params.title,
      due_date: params.dueDate,
      recurrence: 'yearly',
      category: 'custom',
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, month, day, year } = await req.json() as {
      clientId: string; month: number; day: number; year?: number
    }
    if (!clientId || !month || month < 1 || month > 12 || !day || day < 1 || day > 31) {
      return NextResponse.json({ error: 'Invalid birthday' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()

    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })

    const { data: client } = await admin
      .from('clients')
      .select('id, name, org_id')
      .eq('id', clientId)
      .eq('org_id', member.org_id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    // Same timezone resolution as WhatsApp — derived from the org owner's
    // phone number, defaulting to WAT if none is on file.
    const { data: owner } = await admin
      .from('org_members')
      .select('whatsapp_number')
      .eq('org_id', member.org_id)
      .eq('role', 'owner')
      .maybeSingle()
    const tz = resolveTimezone(owner?.whatsapp_number)
    const today = dateStrInTimezone(tz, new Date())
    const birthdayDate = nextOccurrenceOfDate(today, month, day)

    const tiers = [
      { date: addMonthsToDateStr(birthdayDate, -1), title: `🎂 ${client.name}'s birthday is in 1 month` },
      { date: addDaysToDateStr(birthdayDate, -7), title: `🎂 ${client.name}'s birthday is in 1 week` },
      { date: addDaysToDateStr(birthdayDate, -1), title: `🎂 ${client.name}'s birthday is tomorrow!` },
    ]

    await admin.from('clients').update({
      birthday_month: month,
      birthday_day: day,
      birthday_year: year ?? null,
    }).eq('id', clientId)

    for (const tier of tiers) {
      // Skip anything already in the past this cycle — never silently
      // create a past-dated reminder. Next year's cycle creates it fresh.
      if (tier.date < today) continue
      await upsertReminder(admin, { orgId: member.org_id, clientId, title: tier.title, dueDate: tier.date })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('set-birthday error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
