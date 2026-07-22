// webhook.ts
// Receives Twilio POST to /webhook/whatsapp, verifies signature, calls message handler.
//
// ASYNC STRATEGY (all message types):
// Twilio's webhook timeout is 15 seconds. Image/voice processing (Claude Vision,
// Whisper) reliably takes long enough to need an immediate ack + background REST
// reply. Text messages used to be assumed "fast" and handled synchronously — that
// assumption broke down once a single text message could trigger several chained
// actions (e.g. set a client's birthday AND set a reminder), each its own DB
// round trip on top of the Claude call. When that total crossed Twilio's timeout,
// the sync response never arrived and the user saw nothing at all, not even a
// late reply. So text messages now use the same immediate-ack-then-REST pattern.
//
// THINKING-INDICATOR RACE:
// Most text messages still resolve in well under a second, so we don't want a
// "thinking" message popping up on every reply. Instead we race the real
// processing against a short timer (THINKING_DELAY_MS) — only if handleMessage
// hasn't resolved by then do we send an interim message, so slow replies get
// visible feedback instead of silence, and fast ones stay a single message.

import { Router, Request, Response } from 'express'
import { verifyTwilioSignature } from './auth'
import { handleMessage } from './message-handler'
import { buildEmptyResponse, buildTextResponse, extractTextFromTwiml } from './twiml-builder'
import { sendWhatsAppMessage } from './twilio-sender'
import { transcribeVoiceNote } from './voice-transcriber'
import { TwilioWebhookBody } from '../types'

const APP_URL = process.env.WEBAPP_URL || 'app.gettrueflow.com'
const THINKING_DELAY_MS = 4000

const THINKING_MESSAGES = [
  "🤔 Still working on that, one moment...",
  "Just a sec, sorting that out for you...",
  "🤔 Hang tight, almost got it...",
]

export const webhookRouter = Router()

webhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  res.set('Content-Type', 'text/xml')

  if (process.env.NODE_ENV === 'production') {
    if (!verifyTwilioSignature(req)) {
      console.warn('webhook: invalid Twilio signature — request rejected')
      res.status(403).send('<Response></Response>')
      return
    }
  }

  const body = req.body as TwilioWebhookBody

  if (!body.From || !body.MessageSid) {
    res.send(buildEmptyResponse())
    return
  }

  const hasMedia = parseInt(body.NumMedia) > 0 && !!body.MediaUrl0
  const isVoiceNote = hasMedia && (body.MediaContentType0 || '').startsWith('audio/')
  const hasImage = hasMedia && !isVoiceNote
  const phoneNumber = body.From.replace('whatsapp:', '')

  if (isVoiceNote) {
    // Same timeout constraint as images — transcription can take a few
    // seconds, so ack immediately and process in the background.
    res.send(buildTextResponse('🎙️ Listening to your voice note...'))

    ;(async () => {
      const transcript = await transcribeVoiceNote(body.MediaUrl0!)

      if (!transcript) {
        await sendWhatsAppMessage(
          phoneNumber,
          "Sorry, I couldn't quite make that out — mind typing it instead? 🙏"
        ).catch(() => {})
        return
      }

      // Feed the transcript into the EXACT same pipeline a typed text
      // message goes through — construct a body where Body is the
      // transcript and every media field is cleared, so handleMessage
      // (which derives hasImage/imageUrl straight from these same fields)
      // treats this identically to the user having typed it themselves.
      // No separate classification or DB-write logic lives here or ever
      // should — that would be a second, divergent pipeline.
      const textBody: TwilioWebhookBody = {
        ...body,
        Body: transcript,
        NumMedia: '0',
        MediaUrl0: undefined,
        MediaContentType0: undefined,
      }

      try {
        const twiml = await handleMessage(textBody)
        const text = extractTextFromTwiml(twiml)
        if (text) await sendWhatsAppMessage(phoneNumber, text)
      } catch (err) {
        console.error('webhook: voice note text-pipeline handling failed:', err)
        await sendWhatsAppMessage(
          phoneNumber,
          `Sorry, I had trouble with that. Please try again or type it instead.`
        ).catch(() => {})
      }
    })()

    return
  }

  if (hasImage) {
    // Acknowledge Twilio immediately — avoids the 15-second timeout
    res.send(buildTextResponse('📸 Reading your image...'))

    // Process in background — send real reply via Twilio REST API
    handleMessage(body)
      .then(twiml => {
        const text = extractTextFromTwiml(twiml)
        if (text) return sendWhatsAppMessage(phoneNumber, text)
      })
      .catch(err => {
        console.error('webhook: async image handler failed:', err)
        sendWhatsAppMessage(
          phoneNumber,
          `Sorry, I had trouble processing that image. Please try again or add it manually at *${APP_URL}/receipts*`
        ).catch(() => {})
      })

    return
  }

  // Text messages — ack Twilio immediately, process in background, and send
  // the real reply via REST. A short race decides whether the user also sees
  // an interim "still working on it" message before the real one arrives.
  res.send(buildEmptyResponse())

  let settled = false
  const thinkingTimer = setTimeout(() => {
    if (settled) return
    const msg = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)]
    sendWhatsAppMessage(phoneNumber, msg).catch(() => {})
  }, THINKING_DELAY_MS)

  handleMessage(body)
    .then(twiml => {
      settled = true
      clearTimeout(thinkingTimer)
      const text = extractTextFromTwiml(twiml)
      if (text) return sendWhatsAppMessage(phoneNumber, text)
    })
    .catch(err => {
      settled = true
      clearTimeout(thinkingTimer)
      console.error('webhook: async text handler failed:', err)
      sendWhatsAppMessage(
        phoneNumber,
        `Sorry, I had trouble with that. Please try again in a moment.`
      ).catch(() => {})
    })
})
