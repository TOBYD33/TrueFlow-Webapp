// Existing reminder rows store their wall clock in Africa/Lagos (UTC+1).
// Resolve the user's local request to that canonical clock before saving.
export const STORAGE_TIMEZONE = 'Africa/Lagos'
export const DEFAULT_REMINDER_TIME = '08:00'
const RECURRENCES = new Set(['once', 'daily', 'weekly', 'monthly', 'yearly'])
export class ReminderValidationError extends Error {}

export function localDateTime(timezone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (key: string) => parts.find(p => p.type === key)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, seconds: get('second') }
}

export function instantFromLocal(date: string, time: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new ReminderValidationError('Choose a valid date and a time in HH:MM format.')
  }
  const desired = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(desired) || new Date(desired).toISOString().slice(0, 10) !== date) {
    throw new ReminderValidationError('That calendar date does not exist.')
  }
  let candidate = desired
  try {
    for (let i = 0; i < 4; i++) {
      const local = localDateTime(timezone, new Date(candidate))
      const offset = Date.parse(`${local.date}T${local.time}:${local.seconds}Z`) - candidate
      candidate = desired - offset
    }
    const result = new Date(candidate)
    const actual = localDateTime(timezone, result)
    if (actual.date !== date || actual.time !== time) {
      throw new ReminderValidationError('That time is skipped by the daylight saving change. Please choose another time.')
    }
    // Both sides of a repeated DST hour match the same wall clock: ask,
    // rather than silently picking one of two possible instants.
    for (const delta of [-3600000, 3600000]) {
      const other = localDateTime(timezone, new Date(candidate + delta))
      if (other.date === date && other.time === time) {
        throw new ReminderValidationError('That time occurs twice during the daylight saving change. Please choose a time outside that hour.')
      }
    }
    return result
  } catch (error) {
    if (error instanceof ReminderValidationError) throw error
    throw new ReminderValidationError('Choose a valid IANA timezone, such as Africa/Lagos.')
  }
}

export function resolveReminderDate(rawDate: string, request: string, timezone: string, now = new Date()) {
  const today = localDateTime(timezone, now).date
  const words = request.toLowerCase()
  const matches = [...words.matchAll(/\b(tomorrow|today|yesterday)\b/g)].map(match => match[1])
  if (new Set(matches).size > 1) throw new ReminderValidationError('Please set each reminder separately so I can confirm its exact date.')
  const relative = matches[0]
  // A relative word about a different action is not enough to override an
  // explicit date. Only ground it when it is part of a reminder request.
  if (relative && /\b(remind|reminder|remember)\b/.test(words) && !/\d{4}-\d{2}-\d{2}|\b(next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(words)) {
    const day = new Date(`${today}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + (relative === 'tomorrow' ? 1 : relative === 'yesterday' ? -1 : 0))
    return day.toISOString().slice(0, 10)
  }
  return rawDate
}

export function prepareReminder(date: string, time: string | undefined, recurrence: string, timezone: string, now = new Date()) {
  if (!RECURRENCES.has(recurrence)) throw new ReminderValidationError('Choose a supported recurrence.')
  const localTime = time || DEFAULT_REMINDER_TIME
  const due = instantFromLocal(date, localTime, timezone)
  // Recurring reminders also need a future first occurrence. This stops a
  // past series from firing immediately once per minute during catch-up.
  if (due.getTime() <= now.getTime()) {
    throw new ReminderValidationError('That time has already passed. Choose a future date and time.')
  }
  if (recurrence !== 'once' && timezone !== STORAGE_TIMEZONE) {
    throw new ReminderValidationError('Recurring reminders currently use Africa/Lagos time. Choose that timezone or create a one-time reminder for your local time.')
  }
  const stored = localDateTime(STORAGE_TIMEZONE, due)
  return { due_date: stored.date, due_time: stored.time, local_date: date, local_time: localTime, timezone }
}

export function nextReminderDate(current: string, recurrence: string) {
  const d = new Date(`${current}T00:00:00Z`)
  const originalDay = d.getUTCDate()
  if (recurrence === 'daily' || recurrence === 'weekly') d.setUTCDate(originalDay + (recurrence === 'daily' ? 1 : 7))
  else if (recurrence === 'monthly' || recurrence === 'yearly') {
    d.setUTCDate(1)
    if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
    else d.setUTCFullYear(d.getUTCFullYear() + 1)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(originalDay, last))
  }
  return d.toISOString().slice(0, 10)
}
