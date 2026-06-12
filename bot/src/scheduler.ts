// scheduler.ts
// All cron jobs. Call startScheduler() from index.ts on server startup.

import cron from 'node-cron'
import { fireDueReminders, fireAdvanceReminders } from './reminder-service'
import { sendWeeklySummaries, sendMonthlyReports } from './report-service'
import { checkBudgetAlerts } from './budget-service'

export function startScheduler() {
  // Fire due reminders — every day 8am WAT (7am UTC)
  cron.schedule('0 7 * * *', () => fireDueReminders(), { timezone: 'UTC' })

  // Fire 3-day advance warnings — every day 8am WAT
  cron.schedule('0 7 * * *', () => fireAdvanceReminders(), { timezone: 'UTC' })

  // Weekly summary — every Sunday 8am WAT
  cron.schedule('0 7 * * 0', () => sendWeeklySummaries(), { timezone: 'UTC' })

  // Monthly report — 1st of month 9am WAT (8am UTC)
  cron.schedule('0 8 1 * *', () => sendMonthlyReports(), { timezone: 'UTC' })

  // Budget alert check — every hour
  cron.schedule('0 * * * *', () => checkBudgetAlerts(), { timezone: 'UTC' })

  console.log('TrueFlio scheduler running ✅')
}
