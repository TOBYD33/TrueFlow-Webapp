// index.ts
// Express server entry point. Mounts the webhook router and starts the scheduler.

import * as dotenv from 'dotenv'
dotenv.config({ override: true })

import express from 'express'
import { webhookRouter } from './webhook'
import { startScheduler } from './scheduler'
import {startInvoiceDispatcher} from './invoice-dispatcher'

const app = express()
const PORT = process.env.TRUEFLOW_BOT_PORT || process.env.PORT || 3000

// Parse URL-encoded bodies — Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TrueFlow WhatsApp Bot', timestamp: new Date().toISOString() })
})

// WhatsApp webhook
app.use('/webhook', webhookRouter)

app.listen(PORT, () => {
  console.log(`TrueFlow bot running on port ${PORT} ✅`)
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`)
  console.log(`AI configured: ${Boolean(process.env.ANTHROPIC_API_KEY)}`)
  startInvoiceDispatcher()
  if (process.env.SCHEDULER_ENABLED !== 'false') startScheduler()
  else console.log('Scheduler disabled for local verification')
})

export default app
