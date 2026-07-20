// voice-transcriber.ts
// Downloads a WhatsApp voice note (audio/ogg, Opus codec) from its Twilio
// media URL and transcribes it to text.
//
// Service choice: OpenAI's Whisper API (whisper-1) — cheapest of the three
// options considered ($0.006/min, vs. Deepgram/AssemblyAI's per-minute
// pricing plus a separate account/SDK to integrate), and simplest given the
// existing stack: a single REST call with a multipart body, no new SDK
// beyond `form-data` (already a project dependency for this exact purpose).
// Requires OPENAI_API_KEY in the environment — add it to .env and Railway;
// this module fails gracefully (returns null) if it's missing or the call
// errors, never throws into the caller.

import axios from 'axios'
import FormData from 'form-data'

export async function transcribeVoiceNote(mediaUrl: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('transcribeVoiceNote: OPENAI_API_KEY is not set — cannot transcribe')
    return null
  }

  try {
    // Twilio media URLs require the same Basic Auth as image downloads
    // (see image-analyzer.ts's analyzeImage for the identical pattern).
    const audioResponse = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID!,
        password: process.env.TWILIO_AUTH_TOKEN!,
      },
    })
    const buffer = Buffer.from(audioResponse.data as ArrayBuffer)

    const form = new FormData()
    form.append('file', buffer, { filename: 'voice-note.ogg', contentType: 'audio/ogg' })
    form.append('model', 'whisper-1')

    const transcriptionResponse = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        timeout: 20000,
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
      }
    )

    const transcript = String(transcriptionResponse.data?.text || '').trim()
    return transcript.length > 0 ? transcript : null
  } catch (err) {
    console.error('transcribeVoiceNote failed:', err)
    return null
  }
}
