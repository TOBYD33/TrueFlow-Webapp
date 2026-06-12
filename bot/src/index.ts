// index.ts
// Express server entry point. Mounts the webhook router and starts the scheduler.

import * as dotenv from 'dotenv'
dotenv.config({ override: true })

import express from 'express'
import { webhookRouter } from './webhook'
import { startScheduler } from './scheduler'

const app = express()
const PORT = process.env.PORT || 3000

// Parse URL-encoded bodies — Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TrueFlio WhatsApp Bot', timestamp: new Date().toISOString() })
})

// WhatsApp webhook
app.use('/webhook', webhookRouter)

app.listen(PORT, () => {
  console.log(`TrueFlio bot running on port ${PORT} ✅`)
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`)
  console.log(`Anthropic key length: ${process.env.ANTHROPIC_API_KEY?.length}, starts: ${process.env.ANTHROPIC_API_KEY?.substring(0, 25)}, ends: ${process.env.ANTHROPIC_API_KEY?.slice(-10)}`)
  startScheduler()
})

export default app
