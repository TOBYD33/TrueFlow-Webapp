// client-birthday-service.ts
// Sets a client's birthday and generates the three tiered reminders (1
// month before, 1 week before, 1 day before), recurring every year.
//
// Reuses the reminder system's own 'yearly' recurrence rather than any new
// "regenerate next year" job — fireDueReminders() already advances a
// yearly reminder's due_date by one year in place once it fires (see
// reminder-service.ts's getNextDate), so setting recurrence: 'yearly' here
// is the entire regeneration mechanism. Also reuses setReminder() directly
// for its upsert-by-intent dedup and client_id linking, and the shared
// timezone-util for all date math — never a second date-computation path.

import { supabase } from './supabase'
import { setReminder } from './reminder-service'
import { resolveTimezone, dateStrInTimezone, addDaysToDateStr, addMonthsToDateStr, nextOccurrenceOfDate } from './timezone-util'

export async function setClientBirthday(params: {
  orgId: string
  clientId: string
  clientName: string
  phoneNumber: string // resolves the org owner's timezone, same as reminder date resolution
  month: number
  day: number
  year?: number
}): Promise<void> {
  await supabase
    .from('clients')
    .update({
      birthday_month: params.month,
      birthday_day: params.day,
      birthday_year: params.year ?? null,
    })
    .eq('id', params.clientId)

  const tz = resolveTimezone(params.phoneNumber)
  const today = dateStrInTimezone(tz, new Date())
  const birthdayDate = nextOccurrenceOfDate(today, params.month, params.day)

  const tiers = [
    { date: addMonthsToDateStr(birthdayDate, -1), title: `🎂 ${params.clientName}'s birthday is in 1 month` },
    { date: addDaysToDateStr(birthdayDate, -7), title: `🎂 ${params.clientName}'s birthday is in 1 week` },
    { date: addDaysToDateStr(birthdayDate, -1), title: `🎂 ${params.clientName}'s birthday is tomorrow!` },
  ]

  for (const tier of tiers) {
    // Skip any tier that already fell in the past for THIS occurrence —
    // same safeguard as the core reminder fix: never silently create a
    // past-dated reminder. It recurs yearly regardless, so next year's
    // cycle creates it fresh once this year's date arrives naturally.
    if (tier.date < today) continue

    await setReminder({
      orgId: params.orgId,
      title: tier.title,
      dueDate: tier.date,
      recurrence: 'yearly',
      category: 'custom',
      clientId: params.clientId,
    })
  }
}
